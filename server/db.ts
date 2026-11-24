import { randomUUID } from 'node:crypto';
import { attachDatabasePool } from '@vercel/functions';
import { Pool, types, type PoolClient } from '@neondatabase/serverless';
import type { Question } from '../shared/types.js';
import { initialState } from './game.js';
import { DEFAULT_ADMIN_PASSWORD, hashPassword } from './password.js';

// Millisecond timestamps are stored as bigint; they fit a JS number.
types.setTypeParser(types.builtins.INT8, Number);

// Neon's driver speaks Postgres over WebSockets (port 443), so it also works where 5432 is blocked.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
// Lets Vercel Fluid compute close idle connections before an instance is suspended.
if (process.env.VERCEL) attachDatabasePool(pool);

export type Db = PoolClient;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token text PRIMARY KEY, expires_at bigint NOT NULL);
  CREATE TABLE IF NOT EXISTS login_fails (ip text PRIMARY KEY, count int NOT NULL, since bigint NOT NULL);
  CREATE TABLE IF NOT EXISTS players (
    id text PRIMARY KEY,
    name text NOT NULL,
    color text NOT NULL,
    alive boolean NOT NULL,
    spectator boolean NOT NULL,
    eliminated_round int,
    joined_at bigint NOT NULL,
    last_seen bigint NOT NULL
  );
  CREATE TABLE IF NOT EXISTS answers (
    player_id text PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
    round int NOT NULL,
    choice text NOT NULL
  );
  CREATE TABLE IF NOT EXISTS history (id text PRIMARY KEY, ended_at bigint NOT NULL, entry jsonb NOT NULL);
`;

const SEED_QUESTIONS: Omit<Question, 'id'>[] = [
  { text: 'บนรถเมล์ที่แน่นขนัด คุณจะลุกให้ใครนั่ง?', a: 'เด็ก', b: 'คนแก่', cat: 'ศีลธรรม', seconds: 10 },
  { text: 'เรือกำลังจม มีเสื้อชูชีพตัวเดียว คุณจะให้ใคร?', a: 'ผู้ชาย', b: 'ผู้หญิง', cat: 'เพศ & สังคม', seconds: 10 },
  { text: 'ถ้าเห็นเพื่อนสนิทโกงข้อสอบ คุณจะทำอย่างไร?', a: 'เงียบไว้', b: 'แจ้งครู', cat: 'ศีลธรรม', seconds: 10 },
  { text: 'โกหกเพื่อรักษาน้ำใจ หรือพูดความจริงที่ทำร้าย?', a: 'โกหก', b: 'พูดความจริง', cat: 'ความสัมพันธ์', seconds: 10 },
  { text: 'ใครควรได้รับความเชื่อใจมากกว่ากัน?', a: 'คนรวยที่ทำบุญเยอะ', b: 'คนจนที่ซื่อสัตย์', cat: 'เงิน & ชนชั้น', seconds: 10 },
  { text: 'เมื่อกฎหมายกับศีลธรรมขัดกัน คุณจะยึดอะไร?', a: 'กฎหมาย', b: 'ศีลธรรม', cat: 'การเมือง & กฎ', seconds: 10 },
];

/** A fresh copy of the starter question bank, with new ids. */
export function defaultQuestions(): Question[] {
  return SEED_QUESTIONS.map((q) => ({ ...q, id: randomUUID() }));
}

async function seed(db: Db) {
  const rows: [string, unknown][] = [
    ['admin', hashPassword(DEFAULT_ADMIN_PASSWORD, true)],
    ['questions', defaultQuestions()],
    ['game', initialState()],
  ];
  for (const [key, value] of rows) {
    await db.query('INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [
      key,
      JSON.stringify(value),
    ]);
  }
}

let ready: Promise<void> | null = null;

/** Creates tables and seed rows once per instance; concurrent cold starts serialize on an advisory lock. */
function migrate() {
  ready ??= (async () => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(4242)');
      await db.query(SCHEMA);
      await seed(db);
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      ready = null;
      throw e;
    } finally {
      db.release();
    }
  })();
  return ready;
}

export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  await migrate();
  const db = await pool.connect();
  try {
    return await fn(db);
  } finally {
    db.release();
  }
}

export function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return withDb(async (db) => {
    await db.query('BEGIN');
    try {
      const out = await fn(db);
      await db.query('COMMIT');
      return out;
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      throw e;
    }
  });
}
