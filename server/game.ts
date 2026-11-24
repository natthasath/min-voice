import { randomInt, randomUUID } from 'node:crypto';
import type {
  AdminView,
  Choice,
  GameSettings,
  HistoryEntry,
  LiveQuestion,
  Phase,
  PlayerPublic,
  PlayerView,
  Question,
  RoundResult,
  StandingRow,
} from '../shared/types.js';
import { FIXED_SECONDS_DEFAULT, SECONDS_MAX, SECONDS_MIN, WARN_SECONDS_DEFAULT } from '../shared/types.js';

const EXTEND_SECONDS = 10;
const RECENT_LIMIT = 9;
const UPCOMING_LIMIT = 3;
/** Clients poll about once a second; a player unseen for longer than this counts as offline. */
export const ONLINE_MS = 5_000;
/** Lobby players unseen this long are dropped (closed the tab before the game started). */
export const LOBBY_DROP_MS = 30_000;

/** Everything about the current game except players and answers, stored as one JSON row. */
export interface GameState {
  pin: string;
  phase: Phase;
  round: number;
  settings: GameSettings;
  queue: Question[];
  qIndex: number;
  endsAt: number;
  /** Answer time of the current round; absent in games saved before it existed. */
  roundSeconds?: number;
  result: RoundResult | null;
  startedAt: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  spectator: boolean;
  eliminatedRound: number | null;
  joinedAt: number;
  lastSeen: number;
}

export function newPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function initialState(): GameState {
  return {
    pin: newPin(),
    phase: 'lobby',
    round: 0,
    settings: {
      hideLive: true,
      liveNumbers: false,
      shuffle: false,
      fixedSeconds: FIXED_SECONDS_DEFAULT,
      warnSeconds: WARN_SECONDS_DEFAULT,
    },
    queue: [],
    qIndex: -1,
    endsAt: 0,
    result: null,
    startedAt: 0,
  };
}

function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Game rules over one loaded snapshot. Actions mutate the snapshot; the caller persists it
 * (see `saveGame` in db.ts), including the side effects recorded in `finished`, `answersCleared`
 * and `removed`.
 */
export class Game {
  finished: HistoryEntry | null = null;
  answersCleared = false;
  removed: string[] = [];

  constructor(
    public s: GameState,
    private players: Map<string, Player>,
    private answers: Map<string, Choice>,
    private bank: Question[],
    private now = Date.now(),
  ) {}

  get allPlayers() {
    return [...this.players.values()];
  }

  // ---------- admin actions ----------

  start(): string | null {
    if (this.s.phase !== 'lobby') return 'เกมเริ่มไปแล้ว';
    if (this.bank.length === 0) return 'ยังไม่มีคำถามในคลัง';
    if (this.contestants().length < 2) return 'ต้องมีผู้เล่นอย่างน้อย 2 คน';
    this.s.queue = this.s.settings.shuffle ? shuffled(this.bank) : this.bank.slice();
    this.s.qIndex = -1;
    this.s.round = 0;
    this.s.result = null;
    this.s.startedAt = this.now;
    this.nextQuestion();
    return null;
  }

  close() {
    if (this.s.phase !== 'question') return;
    const alive = this.contestants().filter((p) => p.alive);
    const counts = { A: 0, B: 0 };
    for (const p of alive) {
      const a = this.answers.get(p.id);
      if (a) counts[a]++;
    }
    const noAnswer = alive.length - counts.A - counts.B;
    const outcome: Choice | 'void' =
      counts.A === counts.B || counts.A === 0 || counts.B === 0 ? 'void' : counts.A < counts.B ? 'A' : 'B';

    // Not answering always eliminates, even in a void round, unless nobody answered at all
    // (wiping everyone out would end the game with no winner).
    const nobodyAnswered = noAnswer === alive.length;
    const eliminatedIds: string[] = [];
    for (const p of alive) {
      const a = this.answers.get(p.id);
      const out = outcome === 'void' ? !a && !nobodyAnswered : a !== outcome;
      if (out) {
        p.alive = false;
        p.eliminatedRound = this.s.round;
        eliminatedIds.push(p.id);
      }
    }
    this.s.result = {
      round: this.s.round,
      question: this.liveQuestion()!,
      counts,
      noAnswer,
      outcome,
      survivors: alive.filter((p) => p.alive).map((p) => this.pub(p)),
      eliminatedIds,
    };
    this.s.phase = 'result';
  }

  extend() {
    if (this.s.phase !== 'question') return;
    this.s.endsAt += EXTEND_SECONDS * 1000;
  }

  skip() {
    if (this.s.phase !== 'question') return;
    this.s.round--;
    this.nextQuestion();
  }

  next() {
    if (this.s.phase !== 'result') return;
    this.nextQuestion();
  }

  end() {
    if (this.s.phase === 'question' || this.s.phase === 'result') this.finish();
  }

  reset() {
    for (const p of this.allPlayers) {
      if (!this.online(p)) {
        this.players.delete(p.id);
        this.removed.push(p.id);
        continue;
      }
      p.alive = true;
      p.spectator = false;
      p.eliminatedRound = null;
    }
    this.s.pin = newPin();
    this.s.phase = 'lobby';
    this.s.round = 0;
    this.s.result = null;
    this.clearAnswers();
  }

  updateSettings(patch: Partial<GameSettings>) {
    if (typeof patch.hideLive === 'boolean') this.s.settings.hideLive = patch.hideLive;
    if (typeof patch.liveNumbers === 'boolean') this.s.settings.liveNumbers = patch.liveNumbers;
    if (typeof patch.shuffle === 'boolean') this.s.settings.shuffle = patch.shuffle;
    const secs = patch.fixedSeconds;
    if (secs === null || (Number.isInteger(secs) && secs! >= SECONDS_MIN && secs! <= SECONDS_MAX)) {
      this.s.settings.fixedSeconds = secs ?? null;
    }
    const warn = patch.warnSeconds;
    if (Number.isInteger(warn) && warn! >= 0 && warn! <= SECONDS_MAX) this.s.settings.warnSeconds = warn!;
  }

  /** The question timer has no process to fire it; whoever polls after `endsAt` closes the round. */
  get due() {
    return this.s.phase === 'question' && this.now >= this.s.endsAt;
  }

  // ---------- flow ----------

  private nextQuestion() {
    const aliveCount = this.contestants().filter((p) => p.alive).length;
    if (aliveCount <= 1 || this.s.qIndex + 1 >= this.s.queue.length) {
      this.finish();
      return;
    }
    this.s.qIndex++;
    this.s.round++;
    this.clearAnswers();
    this.s.result = null;
    this.s.phase = 'question';
    this.s.roundSeconds = this.fixedSeconds() ?? this.s.queue[this.s.qIndex].seconds;
    this.s.endsAt = this.now + this.s.roundSeconds * 1000;
  }

  private clearAnswers() {
    this.answers.clear();
    this.answersCleared = true;
  }

  private finish() {
    this.s.phase = 'finished';
    const standings = this.standings();
    this.finished = {
      id: randomUUID(),
      startedAt: this.s.startedAt,
      endedAt: this.now,
      rounds: this.s.round,
      players: this.contestants().length,
      winners: this.winners().map((p) => p.name),
      top: standings.slice(0, 10).map((r) => ({ rank: r.rank, name: r.player.name, label: r.label })),
    };
  }

  // ---------- derived ----------

  private online(p: Player) {
    return this.now - p.lastSeen < ONLINE_MS;
  }

  private contestants() {
    return this.allPlayers.filter((p) => !p.spectator);
  }

  private pub(p: Player): PlayerPublic {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      alive: p.alive,
      spectator: p.spectator,
      eliminatedRound: p.eliminatedRound,
      online: this.online(p),
    };
  }

  private liveQuestion(): LiveQuestion | null {
    const q = this.s.queue[this.s.qIndex];
    if (!q || (this.s.phase !== 'question' && this.s.phase !== 'result')) return null;
    const seconds = this.s.roundSeconds ?? q.seconds;
    return { text: q.text, a: q.a, b: q.b, cat: q.cat, seconds, endsAt: this.s.endsAt };
  }

  private liveCounts() {
    const counts = { A: 0, B: 0 };
    for (const c of this.answers.values()) counts[c]++;
    return counts;
  }

  /** Games saved before the setting existed get the default; an explicit null means per-question time. */
  private fixedSeconds() {
    const v = this.s.settings.fixedSeconds;
    return v === undefined ? FIXED_SECONDS_DEFAULT : v;
  }

  private warnSeconds() {
    return this.s.settings.warnSeconds ?? WARN_SECONDS_DEFAULT;
  }

  private liveGap() {
    const { A, B } = this.liveCounts();
    return Math.abs(A - B);
  }

  private winners(): PlayerPublic[] {
    if (this.s.phase !== 'finished') return [];
    return this.contestants()
      .filter((p) => p.alive)
      .map((p) => this.pub(p));
  }

  /** Alive players share first place; the eliminated rank by how late they fell (competition ranking). */
  private standings(): StandingRow[] {
    const finished = this.s.phase === 'finished';
    const sorted = this.contestants().sort((x, y) => {
      const xr = x.alive ? Infinity : (x.eliminatedRound ?? 0);
      const yr = y.alive ? Infinity : (y.eliminatedRound ?? 0);
      return yr - xr || x.joinedAt - y.joinedAt;
    });
    const rows: StandingRow[] = [];
    sorted.forEach((p, i) => {
      const prev = rows[i - 1];
      const same = prev && prev.player.alive === p.alive && prev.player.eliminatedRound === p.eliminatedRound;
      rows.push({
        rank: same ? prev.rank : i + 1,
        player: this.pub(p),
        label: p.alive ? (finished ? 'ชนะ' : 'ยังอยู่') : `รอบ ${p.eliminatedRound}`,
      });
    });
    return rows;
  }

  // ---------- views ----------

  playerView(id: string | undefined): PlayerView {
    const p = id ? this.players.get(id) : undefined;
    const contestants = this.contestants();
    const standings = this.standings();
    const showLive = this.s.phase === 'question' && !this.s.settings.hideLive;
    return {
      pin: this.s.pin,
      phase: this.s.phase,
      serverNow: Date.now(),
      round: this.s.round,
      me: p ? this.pub(p) : null,
      myAnswer: p ? (this.answers.get(p.id) ?? null) : null,
      myRank: p ? (standings.find((r) => r.player.id === p.id)?.rank ?? null) : null,
      totalPlayers: contestants.length,
      aliveCount: contestants.filter((x) => x.alive).length,
      recent: contestants
        .filter((x) => this.online(x))
        .sort((x, y) => y.joinedAt - x.joinedAt)
        .slice(0, RECENT_LIMIT)
        .map((x) => this.pub(x)),
      question: this.liveQuestion(),
      liveCounts: showLive ? this.liveCounts() : null,
      warnSeconds: this.warnSeconds(),
      liveGap: this.s.phase === 'question' && this.s.settings.liveNumbers ? this.liveGap() : null,
      result: this.s.phase === 'result' ? this.s.result : null,
      standings,
      winners: this.winners(),
    };
  }

  adminView(): AdminView {
    const contestants = this.contestants();
    const alive = contestants.filter((p) => p.alive);
    const source = this.s.phase === 'lobby' ? this.bank : this.s.queue;
    const from = this.s.phase === 'lobby' ? 0 : this.s.qIndex + 1;
    return {
      pin: this.s.pin,
      phase: this.s.phase,
      serverNow: Date.now(),
      round: this.s.round,
      // Games saved before `liveNumbers` existed lack the field.
      settings: {
        ...this.s.settings,
        liveNumbers: !!this.s.settings.liveNumbers,
        fixedSeconds: this.fixedSeconds(),
        warnSeconds: this.warnSeconds(),
      },
      totalPlayers: contestants.length,
      aliveCount: alive.length,
      answeredCount: alive.filter((p) => this.answers.has(p.id)).length,
      question: this.liveQuestion(),
      counts: this.liveCounts(),
      players: this.standings().map((r) => ({
        ...r.player,
        answered: this.answers.has(r.player.id),
      })),
      upcoming: source
        .slice(from, from + UPCOMING_LIMIT)
        .map((q, i) => ({ no: from + i + 1, text: q.text })),
      result: this.s.result,
      standings: this.standings(),
      winners: this.winners(),
      questionBankSize: this.bank.length,
    };
  }
}
