import { randomBytes, randomUUID } from 'node:crypto';
import type { Choice, HistoryEntry, Question } from '../shared/types.js';
import type { Db } from './db.js';
import { Game, LOBBY_DROP_MS, type GameState, type Player } from './game.js';
import { checkPassword, hashPassword, type AdminCredentials } from './password.js';

const HISTORY_LIMIT = 50;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 10;

async function getKv<T>(db: Db, key: string, lock = ''): Promise<T> {
  const { rows } = await db.query(`SELECT value FROM kv WHERE key = $1 ${lock}`, [key]);
  return rows[0]?.value as T;
}

async function setKv(db: Db, key: string, value: unknown) {
  await db.query('UPDATE kv SET value = $2 WHERE key = $1', [key, JSON.stringify(value)]);
}

// ---------- admin password ----------

export async function verifyPassword(db: Db, password: string) {
  return checkPassword(password, await getKv<AdminCredentials>(db, 'admin'));
}

export async function setPassword(db: Db, password: string) {
  await setKv(db, 'admin', hashPassword(password));
}

export async function passwordIsDefault(db: Db) {
  return (await getKv<AdminCredentials>(db, 'admin')).isDefault;
}

// ---------- sessions & login throttling ----------

export async function newSession(db: Db) {
  const token = randomBytes(32).toString('hex');
  await db.query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]);
  await db.query('INSERT INTO sessions (token, expires_at) VALUES ($1, $2)', [token, Date.now() + SESSION_TTL_MS]);
  return token;
}

export async function validSession(db: Db, token: unknown) {
  if (typeof token !== 'string' || !token) return false;
  const { rowCount } = await db.query('SELECT 1 FROM sessions WHERE token = $1 AND expires_at > $2', [
    token,
    Date.now(),
  ]);
  return rowCount === 1;
}

export async function endSession(db: Db, token: string) {
  await db.query('DELETE FROM sessions WHERE token = $1', [token]);
}

/** Sign out every session except `keep`. */
export async function endOtherSessions(db: Db, keep: string) {
  await db.query('DELETE FROM sessions WHERE token <> $1', [keep]);
}

export async function loginBlocked(db: Db, ip: string) {
  const { rows } = await db.query('SELECT count FROM login_fails WHERE ip = $1 AND since > $2', [
    ip,
    Date.now() - LOGIN_WINDOW_MS,
  ]);
  return (rows[0]?.count ?? 0) >= LOGIN_MAX_FAILS;
}

export async function recordLoginFail(db: Db, ip: string) {
  const now = Date.now();
  await db.query(
    `INSERT INTO login_fails (ip, count, since) VALUES ($1, 1, $2)
     ON CONFLICT (ip) DO UPDATE SET
       count = CASE WHEN login_fails.since > $3 THEN login_fails.count + 1 ELSE 1 END,
       since = CASE WHEN login_fails.since > $3 THEN login_fails.since ELSE $2 END`,
    [ip, now, now - LOGIN_WINDOW_MS],
  );
}

export async function clearLoginFails(db: Db, ip: string) {
  await db.query('DELETE FROM login_fails WHERE ip = $1', [ip]);
}

// ---------- questions ----------

export function getQuestions(db: Db) {
  return getKv<Question[]>(db, 'questions');
}

/** Read-modify-write of the question bank under a row lock; call inside `tx`. */
export async function editQuestions<T>(db: Db, fn: (list: Question[]) => { list: Question[]; out: T }) {
  const { list, out } = fn(await getKv<Question[]>(db, 'questions', 'FOR UPDATE'));
  await setKv(db, 'questions', list);
  return out;
}

export function addQuestion(list: Question[], q: Omit<Question, 'id'>, afterId?: string) {
  const created = { ...q, id: randomUUID() };
  const at = afterId ? list.findIndex((x) => x.id === afterId) : -1;
  if (at >= 0) list.splice(at + 1, 0, created);
  else list.push(created);
  return { list, out: created };
}

/**
 * Puts questions in the order of `ids`. Unknown ids are ignored, and questions missing from `ids`
 * (added by another admin meanwhile) keep their relative order at the end.
 */
export function reorderQuestions(list: Question[], ids: unknown[]) {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const sorted = list
    .map((q, i) => ({ q, key: rank.get(q.id) ?? ids.length + i }))
    .sort((x, y) => x.key - y.key)
    .map((x) => x.q);
  return { list: sorted, out: sorted };
}

// ---------- history ----------

export async function getHistory(db: Db): Promise<HistoryEntry[]> {
  const { rows } = await db.query('SELECT entry FROM history ORDER BY ended_at DESC LIMIT $1', [HISTORY_LIMIT]);
  return rows.map((r) => r.entry);
}

async function addHistory(db: Db, entry: HistoryEntry) {
  await db.query('INSERT INTO history (id, ended_at, entry) VALUES ($1, $2, $3)', [
    entry.id,
    entry.endedAt,
    JSON.stringify(entry),
  ]);
  await db.query(
    'DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY ended_at DESC LIMIT $1)',
    [HISTORY_LIMIT],
  );
}

// ---------- game ----------

interface PlayerRow {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  spectator: boolean;
  eliminated_round: number | null;
  joined_at: number;
  last_seen: number;
}

function toPlayer(r: PlayerRow): Player {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    alive: r.alive,
    spectator: r.spectator,
    eliminatedRound: r.eliminated_round,
    joinedAt: r.joined_at,
    lastSeen: r.last_seen,
  };
}

type Lock = '' | 'FOR SHARE' | 'FOR UPDATE';

export function getGameState(db: Db, lock: Lock = '') {
  return getKv<GameState | undefined>(db, 'game', lock);
}

/** Loads the full snapshot. `withBank` adds the question bank, which only admin views and `start` need. */
export async function loadGame(db: Db, state: GameState, withBank = false) {
  const [players, answers, bank] = await Promise.all([
    db.query<PlayerRow>('SELECT * FROM players'),
    db.query<{ player_id: string; choice: Choice }>('SELECT player_id, choice FROM answers WHERE round = $1', [
      state.round,
    ]),
    withBank ? getQuestions(db) : Promise.resolve([]),
  ]);
  return new Game(
    state,
    new Map(players.rows.map((r) => [r.id, toPlayer(r)])),
    new Map(answers.rows.map((r) => [r.player_id, r.choice])),
    bank,
  );
}

async function saveGame(db: Db, game: Game) {
  await setKv(db, 'game', game.s);
  if (game.removed.length) await db.query('DELETE FROM players WHERE id = ANY($1)', [game.removed]);
  if (game.answersCleared) await db.query('DELETE FROM answers');
  const ps = game.allPlayers;
  if (ps.length) {
    await db.query(
      `UPDATE players p SET alive = u.alive, spectator = u.spectator, eliminated_round = u.er
       FROM unnest($1::text[], $2::bool[], $3::bool[], $4::int[]) AS u (id, alive, spectator, er)
       WHERE p.id = u.id`,
      [ps.map((p) => p.id), ps.map((p) => p.alive), ps.map((p) => p.spectator), ps.map((p) => p.eliminatedRound)],
    );
  }
  if (game.finished) await addHistory(db, game.finished);
}

/** Applies an action to the game under an exclusive row lock; call inside `tx`. */
export async function mutateGame<T>(db: Db, fn: (game: Game) => T, withBank = false) {
  const state = await getGameState(db, 'FOR UPDATE');
  if (!state) return undefined;
  const game = await loadGame(db, state, withBank);
  const out = fn(game);
  await saveGame(db, game);
  return out;
}

/**
 * Closes a question whose time ran out. Pollers that arrive together queue on the row lock;
 * the first one closes the round and the rest see it already closed.
 */
export async function closeIfDue(db: Db, state: GameState) {
  if (state.phase !== 'question' || Date.now() < state.endsAt) return;
  await db.query('BEGIN');
  try {
    const locked = await getGameState(db, 'FOR UPDATE');
    if (locked?.phase === 'question' && Date.now() >= locked.endsAt) {
      const game = await loadGame(db, locked);
      game.close();
      await saveGame(db, game);
    }
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

export async function touchPlayer(db: Db, id: string) {
  await db.query('UPDATE players SET last_seen = $2 WHERE id = $1', [id, Date.now()]);
}

export async function dropIdleLobbyPlayers(db: Db) {
  await db.query('DELETE FROM players WHERE last_seen < $1', [Date.now() - LOBBY_DROP_MS]);
}

/** Creates or updates a player; joining after the lobby makes you a spectator. Call inside `tx`. */
export async function joinPlayer(db: Db, id: string | undefined, name: string, color: string) {
  const state = (await getGameState(db, 'FOR SHARE'))!;
  const now = Date.now();
  if (id) {
    const { rowCount } = await db.query('UPDATE players SET name = $2, color = $3, last_seen = $4 WHERE id = $1', [
      id,
      name,
      color,
      now,
    ]);
    if (rowCount) return id;
  }
  const late = state.phase !== 'lobby';
  const created = randomUUID();
  await db.query(
    `INSERT INTO players (id, name, color, alive, spectator, eliminated_round, joined_at, last_seen)
     VALUES ($1, $2, $3, $4, $5, NULL, $6, $6)`,
    [created, name, color, !late, late, now],
  );
  return created;
}

/** Records (or changes) an alive player's answer while the question is open. Call inside `tx`. */
export async function answer(db: Db, id: string, choice: Choice) {
  // A shared lock lets answers run in parallel but waits for an in-flight close.
  const state = (await getGameState(db, 'FOR SHARE'))!;
  if (state.phase !== 'question' || Date.now() > state.endsAt) return;
  await db.query(
    `INSERT INTO answers (player_id, round, choice)
     SELECT id, $2, $3 FROM players WHERE id = $1 AND alive AND NOT spectator
     ON CONFLICT (player_id) DO UPDATE SET round = EXCLUDED.round, choice = EXCLUDED.choice`,
    [id, state.round, choice],
  );
}
