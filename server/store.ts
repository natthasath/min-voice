import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { HistoryEntry, Question } from '../shared/types';

export const DEFAULT_ADMIN_PASSWORD = 'changeme';
const HISTORY_LIMIT = 50;

interface AdminCredentials {
  salt: string;
  hash: string;
  isDefault: boolean;
}

interface Data {
  admin: AdminCredentials;
  questions: Question[];
  history: HistoryEntry[];
}

const SEED_QUESTIONS: Omit<Question, 'id'>[] = [
  { text: 'บนรถเมล์ที่แน่นขนัด คุณจะลุกให้ใครนั่ง?', a: 'เด็ก', b: 'คนแก่', cat: 'ศีลธรรม', seconds: 10 },
  { text: 'เรือกำลังจม มีเสื้อชูชีพตัวเดียว คุณจะให้ใคร?', a: 'ผู้ชาย', b: 'ผู้หญิง', cat: 'เพศ & สังคม', seconds: 10 },
  { text: 'ถ้าเห็นเพื่อนสนิทโกงข้อสอบ คุณจะทำอย่างไร?', a: 'เงียบไว้', b: 'แจ้งครู', cat: 'ศีลธรรม', seconds: 10 },
  { text: 'โกหกเพื่อรักษาน้ำใจ หรือพูดความจริงที่ทำร้าย?', a: 'โกหก', b: 'พูดความจริง', cat: 'ความสัมพันธ์', seconds: 10 },
  { text: 'ใครควรได้รับความเชื่อใจมากกว่ากัน?', a: 'คนรวยที่ทำบุญเยอะ', b: 'คนจนที่ซื่อสัตย์', cat: 'เงิน & ชนชั้น', seconds: 10 },
  { text: 'เมื่อกฎหมายกับศีลธรรมขัดกัน คุณจะยึดอะไร?', a: 'กฎหมาย', b: 'ศีลธรรม', cat: 'การเมือง & กฎ', seconds: 10 },
];

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export class Store {
  private data: Data;

  constructor(private file = resolve(process.env.DATA_FILE ?? 'data/store.json')) {
    if (existsSync(file)) {
      this.data = JSON.parse(readFileSync(file, 'utf8')) as Data;
    } else {
      this.data = {
        admin: { ...hashPassword(DEFAULT_ADMIN_PASSWORD), isDefault: true },
        questions: SEED_QUESTIONS.map((q) => ({ ...q, id: randomUUID() })),
        history: [],
      };
      this.save();
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }

  // --- admin password ---

  verifyPassword(password: string): boolean {
    const { salt, hash } = this.data.admin;
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, 64);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  setPassword(password: string) {
    this.data.admin = { ...hashPassword(password), isDefault: false };
    this.save();
  }

  get passwordIsDefault() {
    return this.data.admin.isDefault;
  }

  // --- questions ---

  get questions(): Question[] {
    return this.data.questions;
  }

  addQuestion(q: Omit<Question, 'id'>, afterId?: string): Question {
    const created = { ...q, id: randomUUID() };
    const at = afterId ? this.data.questions.findIndex((x) => x.id === afterId) : -1;
    if (at >= 0) this.data.questions.splice(at + 1, 0, created);
    else this.data.questions.push(created);
    this.save();
    return created;
  }

  updateQuestion(id: string, patch: Partial<Omit<Question, 'id'>>): Question | null {
    const q = this.data.questions.find((x) => x.id === id);
    if (!q) return null;
    Object.assign(q, patch);
    this.save();
    return q;
  }

  deleteQuestion(id: string): boolean {
    const before = this.data.questions.length;
    this.data.questions = this.data.questions.filter((x) => x.id !== id);
    if (this.data.questions.length === before) return false;
    this.save();
    return true;
  }

  // --- history ---

  get history(): HistoryEntry[] {
    return this.data.history;
  }

  addHistory(entry: HistoryEntry) {
    this.data.history = [entry, ...this.data.history].slice(0, HISTORY_LIMIT);
    this.save();
  }
}
