import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import {
  CATEGORIES,
  isPaletteColor,
  NAME_MAX,
  PALETTE,
  SECONDS_MAX,
  SECONDS_MIN,
  type Choice,
  type Question,
} from '../shared/types';
import { Game } from './game';
import { Store } from './store';

const PORT = Number(process.env.PORT ?? 3000);
const PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PASSWORD_MIN = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 10;

const store = new Store();
const app = express();
const server = createServer(app);
const io = new Server(server);
const adminIo = io.of('/admin');

// ---------- game wiring ----------

let broadcastQueued = false;
function broadcast() {
  if (broadcastQueued) return;
  broadcastQueued = true;
  setImmediate(() => {
    broadcastQueued = false;
    for (const socket of io.of('/').sockets.values()) {
      socket.emit('state', game.playerView(socket.data.playerId));
    }
    adminIo.emit('state', game.adminView());
  });
}

const game = new Game(
  () => store.questions,
  (entry) => store.addHistory(entry),
  broadcast,
);

// ---------- admin sessions ----------

const sessions = new Map<string, number>();
const loginFails = new Map<string, { count: number; since: number }>();

function newSession() {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function validSession(token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function bearer(req: Request) {
  return req.headers.authorization?.replace(/^Bearer /, '');
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!validSession(bearer(req))) {
    res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    return;
  }
  next();
}

// ---------- validation ----------

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
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

// ---------- REST API ----------

// Behind a reverse proxy (min-voice.codeinsane.dev) so req.ip is the real client for login rate limiting.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(express.json({ limit: '32kb' }));

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip ?? 'unknown';
  const fails = loginFails.get(ip);
  if (fails && Date.now() - fails.since < LOGIN_WINDOW_MS && fails.count >= LOGIN_MAX_FAILS) {
    res.status(429).json({ error: 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่' });
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!store.verifyPassword(password)) {
    const f = fails && Date.now() - fails.since < LOGIN_WINDOW_MS ? fails : { count: 0, since: Date.now() };
    f.count++;
    loginFails.set(ip, f);
    res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    return;
  }
  loginFails.delete(ip);
  res.json({ token: newSession() });
});

app.post('/api/admin/logout', (req, res) => {
  const token = bearer(req);
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (_req, res) => {
  res.json({ passwordIsDefault: store.passwordIsDefault });
});

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { current, next } = req.body ?? {};
  if (typeof current !== 'string' || !store.verifyPassword(current)) {
    res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    return;
  }
  if (typeof next !== 'string' || next.length < PASSWORD_MIN) {
    res.status(400).json({ error: `รหัสผ่านใหม่ต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร` });
    return;
  }
  if (next === current) {
    res.status(400).json({ error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' });
    return;
  }
  store.setPassword(next);
  // Sign out every other session; keep the one that made the change.
  const keep = bearer(req)!;
  for (const token of sessions.keys()) if (token !== keep) sessions.delete(token);
  for (const socket of adminIo.sockets.values()) {
    if (socket.handshake.auth?.token !== keep) socket.disconnect(true);
  }
  res.json({ ok: true });
});

app.get('/api/admin/questions', requireAdmin, (_req, res) => {
  res.json(store.questions);
});

app.post('/api/admin/questions', requireAdmin, (req, res) => {
  const q = cleanQuestion(req.body ?? {}, false);
  if (typeof q === 'string') {
    res.status(400).json({ error: q });
    return;
  }
  const afterId = typeof req.body?.afterId === 'string' ? req.body.afterId : undefined;
  res.json(store.addQuestion(q as Omit<Question, 'id'>, afterId));
  broadcast();
});

app.put('/api/admin/questions/:id', requireAdmin, (req, res) => {
  const patch = cleanQuestion(req.body ?? {}, true);
  if (typeof patch === 'string') {
    res.status(400).json({ error: patch });
    return;
  }
  const q = store.updateQuestion(String(req.params.id), patch);
  if (!q) {
    res.status(404).json({ error: 'ไม่พบคำถาม' });
    return;
  }
  res.json(q);
  broadcast();
});

app.delete('/api/admin/questions/:id', requireAdmin, (req, res) => {
  if (!store.deleteQuestion(String(req.params.id))) {
    res.status(404).json({ error: 'ไม่พบคำถาม' });
    return;
  }
  res.json({ ok: true });
  broadcast();
});

app.get('/api/admin/history', requireAdmin, (_req, res) => {
  res.json(store.history);
});

// ---------- sockets: players ----------

io.on('connection', (socket) => {
  function bind(id: string) {
    if (socket.data.playerId === id) return;
    if (socket.data.playerId) game.disconnect(socket.data.playerId);
    socket.data.playerId = id;
    game.connect(id);
  }

  socket.on('player:resume', (id: unknown) => {
    if (typeof id === 'string' && game.hasPlayer(id)) bind(id);
    socket.emit('state', game.playerView(socket.data.playerId));
  });

  socket.on('player:join', (body: unknown, ack?: (res: { id?: string; error?: string }) => void) => {
    const { id, name, color } = (body ?? {}) as Record<string, unknown>;
    const cleanName = cleanText(name, NAME_MAX);
    if (!cleanName) return ack?.({ error: 'กรุณาใส่ชื่อเล่น' });
    const hex = isPaletteColor(color) ? color : PALETTE[0].hex;
    const player = game.join(typeof id === 'string' ? id : socket.data.playerId, cleanName, hex);
    bind(player.id);
    ack?.({ id: player.id });
  });

  socket.on('player:answer', (choice: unknown) => {
    if (socket.data.playerId && (choice === 'A' || choice === 'B')) {
      game.answer(socket.data.playerId, choice as Choice);
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.playerId) game.disconnect(socket.data.playerId);
  });
});

// ---------- sockets: admin ----------

adminIo.use((socket, next) => {
  if (validSession(socket.handshake.auth?.token)) next();
  else next(new Error('unauthorized'));
});

adminIo.on('connection', (socket) => {
  socket.emit('state', game.adminView());
  // Re-check the session on every action so a revoked token stops working immediately.
  socket.use((_packet, next) => {
    if (validSession(socket.handshake.auth?.token)) next();
    else socket.disconnect(true);
  });

  socket.on('admin:start', (ack?: (err: string | null) => void) => {
    const err = game.start();
    if (typeof ack === 'function') ack(err);
  });
  socket.on('admin:close', () => game.close());
  socket.on('admin:extend', () => game.extend());
  socket.on('admin:skip', () => game.skip());
  socket.on('admin:next', () => game.next());
  socket.on('admin:end', () => game.end());
  socket.on('admin:reset', () => game.reset());
  socket.on('admin:settings', (patch: unknown) => {
    if (patch && typeof patch === 'object') game.updateSettings(patch);
  });
});

// ---------- static (production) ----------

const dist = resolve('dist');
if (PROD && existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

server.listen(PORT, () => {
  console.log(`Min Voice server on http://localhost:${PORT}${PROD ? '' : ' (API only — open the Vite URL)'}`);
  if (store.passwordIsDefault) {
    console.log('Admin password is still the default ("changeme"). Change it under /admin/settings.');
  }
});
