import express, { type NextFunction, type Request, type Response } from 'express';
import {
  CATEGORIES,
  isPaletteColor,
  NAME_MAX,
  PALETTE,
  SECONDS_MAX,
  SECONDS_MIN,
  type Choice,
  type GameSettings,
  type Question,
} from '../shared/types.js';
import { defaultQuestions, tx, withDb } from './db.js';
import type { Game } from './game.js';
import * as store from './store.js';

const PASSWORD_MIN = 8;

export const app = express();

// Behind Vercel's proxy (or a local reverse proxy) so req.ip is the real client for login rate limiting.
app.set('trust proxy', process.env.VERCEL ? true : 'loopback, linklocal, uniquelocal');
app.use(express.json({ limit: '32kb' }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/** Wraps an async handler so a thrown error becomes a 500 instead of an unhandled rejection. */
function route(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

function bearer(req: Request) {
  return req.headers.authorization?.replace(/^Bearer /, '');
}

/** Like `route`, but answers 401 unless the request carries a live admin session. */
function admin(fn: (req: Request, res: Response) => Promise<void>) {
  return route(async (req, res) => {
    if (!(await withDb((db) => store.validSession(db, bearer(req))))) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      return;
    }
    await fn(req, res);
  });
}

// ---------- validation ----------

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
}

function cleanId(v: unknown): string | undefined {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) ? v : undefined;
}

function cleanQuestion(body: Record<string, unknown>, partial: boolean): Partial<Omit<Question, 'id'>> | string {
  const out: Partial<Omit<Question, 'id'>> = {};
  const fields = [
    ['text', 300],
    ['a', 60],
    ['b', 60],
  ] as const;
  for (const [key, max] of fields) {
    if (body[key] === undefined && partial) continue;
    const v = cleanText(body[key], max);
    if (v === null) return `ข้อมูล "${key}" ไม่ถูกต้อง`;
    out[key] = v;
  }
  if (body.cat !== undefined || !partial) {
    if (!CATEGORIES.includes(body.cat as string)) return 'หมวดไม่ถูกต้อง';
    out.cat = body.cat as string;
  }
  if (body.seconds !== undefined || !partial) {
    const n = Number(body.seconds);
    if (!Number.isInteger(n) || n < SECONDS_MIN || n > SECONDS_MAX) {
      return `เวลาตอบต้องอยู่ระหว่าง ${SECONDS_MIN}–${SECONDS_MAX} วินาที`;
    }
    out.seconds = n;
  }
  return out;
}

// ---------- players ----------

app.get(
  '/api/state',
  route(async (req, res) => {
    const id = cleanId(req.query.id);
    const view = await withDb(async (db) => {
      if (id) await store.touchPlayer(db, id);
      let state = (await store.getGameState(db))!;
      if (state.phase === 'question') {
        await store.closeIfDue(db, state);
        state = (await store.getGameState(db))!;
      } else if (state.phase === 'lobby') {
        await store.dropIdleLobbyPlayers(db);
      }
      return (await store.loadGame(db, state)).playerView(id);
    });
    res.json(view);
  }),
);

app.post(
  '/api/join',
  route(async (req, res) => {
    const { id, name, color } = (req.body ?? {}) as Record<string, unknown>;
    const cleanName = cleanText(name, NAME_MAX);
    if (!cleanName) {
      res.status(400).json({ error: 'กรุณาใส่ชื่อเล่น' });
      return;
    }
    const hex = isPaletteColor(color) ? color : PALETTE[0].hex;
    res.json({ id: await tx((db) => store.joinPlayer(db, cleanId(id), cleanName, hex)) });
  }),
);

app.post(
  '/api/answer',
  route(async (req, res) => {
    const { id, choice } = (req.body ?? {}) as Record<string, unknown>;
    const playerId = cleanId(id);
    if (playerId && (choice === 'A' || choice === 'B')) {
      await tx((db) => store.answer(db, playerId, choice as Choice));
    }
    res.json({ ok: true });
  }),
);

// ---------- admin auth ----------

app.post(
  '/api/admin/login',
  route(async (req, res) => {
    const ip = req.ip ?? 'unknown';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    await withDb(async (db) => {
      if (await store.loginBlocked(db, ip)) {
        res.status(429).json({ error: 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่' });
      } else if (!(await store.verifyPassword(db, password))) {
        await store.recordLoginFail(db, ip);
        res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
      } else {
        await store.clearLoginFails(db, ip);
        res.json({ token: await store.newSession(db) });
      }
    });
  }),
);

app.post(
  '/api/admin/logout',
  route(async (req, res) => {
    const token = bearer(req);
    if (token) await withDb((db) => store.endSession(db, token));
    res.json({ ok: true });
  }),
);

app.get(
  '/api/admin/me',
  admin(async (_req, res) => {
    res.json({ passwordIsDefault: await withDb(store.passwordIsDefault) });
  }),
);

app.post(
  '/api/admin/password',
  admin(async (req, res) => {
    const { current, next } = req.body ?? {};
    await tx(async (db) => {
      if (typeof current !== 'string' || !(await store.verifyPassword(db, current))) {
        res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
      } else if (typeof next !== 'string' || next.length < PASSWORD_MIN) {
        res.status(400).json({ error: `รหัสผ่านใหม่ต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร` });
      } else if (next === current) {
        res.status(400).json({ error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' });
      } else {
        await store.setPassword(db, next);
        // Sign out every other session; keep the one that made the change.
        await store.endOtherSessions(db, bearer(req)!);
        res.json({ ok: true });
      }
    });
  }),
);

// ---------- admin game control ----------

app.get(
  '/api/admin/state',
  admin(async (_req, res) => {
    const view = await withDb(async (db) => {
      let state = (await store.getGameState(db))!;
      if (state.phase === 'question') {
        await store.closeIfDue(db, state);
        state = (await store.getGameState(db))!;
      }
      return (await store.loadGame(db, state, true)).adminView();
    });
    res.json(view);
  }),
);

const ACTIONS: Record<string, (game: Game, payload: unknown) => string | null | void> = {
  start: (g) => g.start(),
  close: (g) => g.close(),
  extend: (g) => g.extend(),
  skip: (g) => g.skip(),
  next: (g) => g.next(),
  end: (g) => g.end(),
  reset: (g) => g.reset(),
  settings: (g, patch) => {
    if (patch && typeof patch === 'object') g.updateSettings(patch as Partial<GameSettings>);
  },
};

app.post(
  '/api/admin/action/:name',
  admin(async (req, res) => {
    const action = ACTIONS[String(req.params.name)];
    if (!action) {
      res.status(404).json({ error: 'ไม่รู้จักคำสั่งนี้' });
      return;
    }
    const error = await tx((db) =>
      store.mutateGame(db, (g) => action(g, req.body), req.params.name === 'start'),
    );
    res.json({ error: error ?? null });
  }),
);

// ---------- admin questions & history ----------

app.get(
  '/api/admin/questions',
  admin(async (_req, res) => {
    res.json(await withDb(store.getQuestions));
  }),
);

app.post(
  '/api/admin/questions',
  admin(async (req, res) => {
    const q = cleanQuestion(req.body ?? {}, false);
    if (typeof q === 'string') {
      res.status(400).json({ error: q });
      return;
    }
    const afterId = typeof req.body?.afterId === 'string' ? req.body.afterId : undefined;
    res.json(
      await tx((db) => store.editQuestions(db, (list) => store.addQuestion(list, q as Omit<Question, 'id'>, afterId))),
    );
  }),
);

app.post(
  '/api/admin/questions/reset',
  admin(async (_req, res) => {
    const list = defaultQuestions();
    res.json(await tx((db) => store.editQuestions(db, () => ({ list, out: list }))));
  }),
);

// Registered before `/:id` so "order" is not taken as a question id.
app.put(
  '/api/admin/questions/order',
  admin(async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'ลำดับคำถามไม่ถูกต้อง' });
      return;
    }
    res.json(await tx((db) => store.editQuestions(db, (list) => store.reorderQuestions(list, ids))));
  }),
);

app.put(
  '/api/admin/questions/:id',
  admin(async (req, res) => {
    const patch = cleanQuestion(req.body ?? {}, true);
    if (typeof patch === 'string') {
      res.status(400).json({ error: patch });
      return;
    }
    const q = await tx((db) =>
      store.editQuestions(db, (list) => {
        const found = list.find((x) => x.id === req.params.id);
        if (found) Object.assign(found, patch);
        return { list, out: found ?? null };
      }),
    );
    if (!q) {
      res.status(404).json({ error: 'ไม่พบคำถาม' });
      return;
    }
    res.json(q);
  }),
);

app.delete(
  '/api/admin/questions/:id',
  admin(async (req, res) => {
    const deleted = await tx((db) =>
      store.editQuestions(db, (list) => {
        const rest = list.filter((x) => x.id !== req.params.id);
        return { list: rest, out: rest.length !== list.length };
      }),
    );
    if (!deleted) {
      res.status(404).json({ error: 'ไม่พบคำถาม' });
      return;
    }
    res.json({ ok: true });
  }),
);

app.get(
  '/api/admin/history',
  admin(async (_req, res) => {
    res.json(await withDb(store.getHistory));
  }),
);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'ไม่พบ' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: 'เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่' });
});
