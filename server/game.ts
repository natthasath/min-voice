import { randomInt, randomUUID } from 'node:crypto';
import {
  type AdminView,
  type Choice,
  type GameSettings,
  type HistoryEntry,
  type LiveQuestion,
  type Phase,
  type PlayerPublic,
  type PlayerView,
  type Question,
  type RoundResult,
  type StandingRow,
} from '../shared/types';

const EXTEND_SECONDS = 10;
const LOBBY_DROP_MS = 30_000;
const RECENT_LIMIT = 9;
const UPCOMING_LIMIT = 3;

interface Player {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  spectator: boolean;
  eliminatedRound: number | null;
  sockets: number;
  joinedAt: number;
  dropTimer?: NodeJS.Timeout;
}

function newPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class Game {
  pin = newPin();
  phase: Phase = 'lobby';
  round = 0;
  settings: GameSettings = { hideLive: true, shuffle: false };

  private players = new Map<string, Player>();
  private queue: Question[] = [];
  private qIndex = -1;
  private answers = new Map<string, Choice>();
  private endsAt = 0;
  private timer?: NodeJS.Timeout;
  private result: RoundResult | null = null;
  private startedAt = 0;

  constructor(
    private getQuestions: () => Question[],
    private onFinish: (entry: HistoryEntry) => void,
    private onChange: () => void,
  ) {}

  // ---------- players ----------

  join(id: string | undefined, name: string, color: string): Player {
    let p = id ? this.players.get(id) : undefined;
    if (p) {
      p.name = name;
      p.color = color;
    } else {
      const late = this.phase !== 'lobby';
      p = {
        id: randomUUID(),
        name,
        color,
        alive: !late,
        spectator: late,
        eliminatedRound: null,
        sockets: 0,
        joinedAt: Date.now(),
      };
      this.players.set(p.id, p);
    }
    this.onChange();
    return p;
  }

  hasPlayer(id: string) {
    return this.players.has(id);
  }

  connect(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.sockets++;
    clearTimeout(p.dropTimer);
    this.onChange();
  }

  disconnect(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.sockets = Math.max(0, p.sockets - 1);
    if (p.sockets === 0 && this.phase === 'lobby') {
      p.dropTimer = setTimeout(() => {
        if (p.sockets === 0 && this.phase === 'lobby') {
          this.players.delete(p.id);
          this.onChange();
        }
      }, LOBBY_DROP_MS);
    }
    this.onChange();
  }

  answer(id: string, choice: Choice) {
    const p = this.players.get(id);
    if (this.phase !== 'question' || !p?.alive || Date.now() > this.endsAt) return;
    this.answers.set(id, choice);
    this.onChange();
  }

  // ---------- admin actions ----------

  start(): string | null {
    if (this.phase !== 'lobby') return 'เกมเริ่มไปแล้ว';
    const bank = this.getQuestions();
    if (bank.length === 0) return 'ยังไม่มีคำถามในคลัง';
    if (this.contestants().length < 2) return 'ต้องมีผู้เล่นอย่างน้อย 2 คน';
    this.queue = this.settings.shuffle ? shuffled(bank) : bank.slice();
    this.qIndex = -1;
    this.round = 0;
    this.result = null;
    this.startedAt = Date.now();
    this.nextQuestion();
    return null;
  }

  close() {
    if (this.phase !== 'question') return;
    clearTimeout(this.timer);
    const alive = this.contestants().filter((p) => p.alive);
    const counts = { A: 0, B: 0 };
    for (const p of alive) {
      const a = this.answers.get(p.id);
      if (a) counts[a]++;
    }
    const noAnswer = alive.length - counts.A - counts.B;
    const outcome: Choice | 'void' =
      counts.A === counts.B || counts.A === 0 || counts.B === 0 ? 'void' : counts.A < counts.B ? 'A' : 'B';

    const eliminatedIds: string[] = [];
    if (outcome !== 'void') {
      for (const p of alive) {
        if (this.answers.get(p.id) !== outcome) {
          p.alive = false;
          p.eliminatedRound = this.round;
          eliminatedIds.push(p.id);
        }
      }
    }
    this.result = {
      round: this.round,
      question: this.liveQuestion()!,
      counts,
      noAnswer,
      outcome,
      survivors: alive.filter((p) => p.alive).map((p) => this.pub(p)),
      eliminatedIds,
    };
    this.phase = 'result';
    this.onChange();
  }

  extend() {
    if (this.phase !== 'question') return;
    this.endsAt += EXTEND_SECONDS * 1000;
    this.schedule();
    this.onChange();
  }

  skip() {
    if (this.phase !== 'question') return;
    this.round--;
    this.nextQuestion();
  }

  next() {
    if (this.phase !== 'result') return;
    this.nextQuestion();
  }

  end() {
    if (this.phase === 'question' || this.phase === 'result') this.finish();
  }

  reset() {
    clearTimeout(this.timer);
    for (const p of [...this.players.values()]) {
      if (p.sockets === 0) {
        this.players.delete(p.id);
        continue;
      }
      p.alive = true;
      p.spectator = false;
      p.eliminatedRound = null;
    }
    this.pin = newPin();
    this.phase = 'lobby';
    this.round = 0;
    this.result = null;
    this.answers.clear();
    this.onChange();
  }

  updateSettings(patch: Partial<GameSettings>) {
    if (typeof patch.hideLive === 'boolean') this.settings.hideLive = patch.hideLive;
    if (typeof patch.shuffle === 'boolean') this.settings.shuffle = patch.shuffle;
    this.onChange();
  }

  // ---------- flow ----------

  private nextQuestion() {
    clearTimeout(this.timer);
    const aliveCount = this.contestants().filter((p) => p.alive).length;
    if (aliveCount <= 1 || this.qIndex + 1 >= this.queue.length) {
      this.finish();
      return;
    }
    this.qIndex++;
    this.round++;
    this.answers.clear();
    this.result = null;
    this.phase = 'question';
    this.endsAt = Date.now() + this.queue[this.qIndex].seconds * 1000;
    this.schedule();
    this.onChange();
  }

  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.close(), Math.max(0, this.endsAt - Date.now()));
  }

  private finish() {
    clearTimeout(this.timer);
    this.phase = 'finished';
    const standings = this.standings();
    this.onFinish({
      id: randomUUID(),
      startedAt: this.startedAt,
      endedAt: Date.now(),
      rounds: this.round,
      players: this.contestants().length,
      winners: this.winners().map((p) => p.name),
      top: standings.slice(0, 10).map((r) => ({ rank: r.rank, name: r.player.name, label: r.label })),
    });
    this.onChange();
  }

  // ---------- derived ----------

  private contestants() {
    return [...this.players.values()].filter((p) => !p.spectator);
  }

  private pub(p: Player): PlayerPublic {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      alive: p.alive,
      spectator: p.spectator,
      eliminatedRound: p.eliminatedRound,
      online: p.sockets > 0,
    };
  }

  private liveQuestion(): LiveQuestion | null {
    const q = this.queue[this.qIndex];
    if (!q || (this.phase !== 'question' && this.phase !== 'result')) return null;
    return { text: q.text, a: q.a, b: q.b, cat: q.cat, seconds: q.seconds, endsAt: this.endsAt };
  }

  private liveCounts() {
    const counts = { A: 0, B: 0 };
    for (const c of this.answers.values()) counts[c]++;
    return counts;
  }

  private winners(): PlayerPublic[] {
    if (this.phase !== 'finished') return [];
    return this.contestants()
      .filter((p) => p.alive)
      .map((p) => this.pub(p));
  }

  /** Alive players share first place; the eliminated rank by how late they fell (competition ranking). */
  private standings(): StandingRow[] {
    const finished = this.phase === 'finished';
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
    const showLive = this.phase === 'question' && !this.settings.hideLive;
    return {
      pin: this.pin,
      phase: this.phase,
      serverNow: Date.now(),
      round: this.round,
      me: p ? this.pub(p) : null,
      myAnswer: p ? (this.answers.get(p.id) ?? null) : null,
      myRank: p ? (standings.find((r) => r.player.id === p.id)?.rank ?? null) : null,
      totalPlayers: contestants.length,
      aliveCount: contestants.filter((x) => x.alive).length,
      recent: contestants
        .filter((x) => x.sockets > 0)
        .sort((x, y) => y.joinedAt - x.joinedAt)
        .slice(0, RECENT_LIMIT)
        .map((x) => this.pub(x)),
      question: this.liveQuestion(),
      liveCounts: showLive ? this.liveCounts() : null,
      result: this.phase === 'result' ? this.result : null,
      standings,
      winners: this.winners(),
    };
  }

  adminView(): AdminView {
    const contestants = this.contestants();
    const alive = contestants.filter((p) => p.alive);
    const source = this.phase === 'lobby' ? this.getQuestions() : this.queue;
    const from = this.phase === 'lobby' ? 0 : this.qIndex + 1;
    return {
      pin: this.pin,
      phase: this.phase,
      serverNow: Date.now(),
      round: this.round,
      settings: { ...this.settings },
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
      result: this.result,
      standings: this.standings(),
      winners: this.winners(),
      questionBankSize: this.getQuestions().length,
    };
  }
}
