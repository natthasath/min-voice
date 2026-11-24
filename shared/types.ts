/**
 * Profile colors. Row 1 is the design's original set; row 2 fills the missing hues at the same
 * muted, warm depth (no neon, nothing close to the orange accent that marks "survived").
 */
export const PALETTE = [
  { hex: '#111111', name: 'ดำ' },
  { hex: '#D9480F', name: 'ส้ม' },
  { hex: '#2F5BD3', name: 'น้ำเงิน' },
  { hex: '#1F7A55', name: 'เขียว' },
  { hex: '#7A3FC2', name: 'ม่วง' },
  { hex: '#5F5F5A', name: 'เทา' },
  { hex: '#D9A21B', name: 'เหลือง' },
  { hex: '#C2255C', name: 'ชมพู' },
  { hex: '#0F7C8C', name: 'เขียวอมฟ้า' },
  { hex: '#8A5A2B', name: 'น้ำตาล' },
  { hex: '#6FA8DC', name: 'ฟ้า' },
  { hex: '#9C86D9', name: 'ลาเวนเดอร์' },
] as const;

export function isPaletteColor(hex: unknown): hex is string {
  return PALETTE.some((p) => p.hex === hex);
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Text color for bold initials on the given background: white like the design, ink on light colors. */
export function textOn(hex: string): string {
  return 1.05 / (luminance(hex) + 0.05) >= 3.5 ? '#FFFFFF' : '#111111';
}

export const CATEGORIES = ['ศีลธรรม', 'เพศ & สังคม', 'เงิน & ชนชั้น', 'ความสัมพันธ์', 'การเมือง & กฎ'];

export const NAME_MAX = 16;
export const SECONDS_MIN = 5;
export const SECONDS_MAX = 30;
export const WARN_SECONDS_DEFAULT = 3;
export const FIXED_SECONDS_DEFAULT = 10;

export type Choice = 'A' | 'B';
export type Phase = 'lobby' | 'question' | 'result' | 'finished';

export interface Question {
  id: string;
  text: string;
  a: string;
  b: string;
  cat: string;
  seconds: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  spectator: boolean;
  eliminatedRound: number | null;
  online: boolean;
}

export interface LiveQuestion {
  text: string;
  a: string;
  b: string;
  cat: string;
  seconds: number;
  endsAt: number;
}

export interface RoundResult {
  round: number;
  question: LiveQuestion;
  counts: { A: number; B: number };
  noAnswer: number;
  /**
   * The side that survived, or 'void' when tied / unanimous / nobody answered. Players who did not
   * answer are eliminated either way, except when nobody answered.
   */
  outcome: Choice | 'void';
  survivors: PlayerPublic[];
  eliminatedIds: string[];
}

export interface StandingRow {
  rank: number;
  player: PlayerPublic;
  /** 'ชนะ' | 'ยังอยู่' | 'รอบ N' */
  label: string;
}

export interface PlayerView {
  pin: string;
  phase: Phase;
  serverNow: number;
  round: number;
  me: PlayerPublic | null;
  myAnswer: Choice | null;
  myRank: number | null;
  totalPlayers: number;
  aliveCount: number;
  recent: PlayerPublic[];
  question: LiveQuestion | null;
  liveCounts: { A: number; B: number } | null;
  /** How many more people picked one side than the other, without saying which; null when hidden. */
  liveGap: number | null;
  warnSeconds: number;
  result: RoundResult | null;
  standings: StandingRow[];
  winners: PlayerPublic[];
}

export interface AdminPlayerRow extends PlayerPublic {
  answered: boolean;
}

export interface GameSettings {
  hideLive: boolean;
  liveNumbers: boolean;
  shuffle: boolean;
  /** Answer time used for every question; null uses each question's own time. */
  fixedSeconds: number | null;
  /** The player timer turns the accent color in the last this-many seconds; 0 turns it off. */
  warnSeconds: number;
}

export interface AdminView {
  pin: string;
  phase: Phase;
  serverNow: number;
  round: number;
  settings: GameSettings;
  totalPlayers: number;
  aliveCount: number;
  answeredCount: number;
  question: LiveQuestion | null;
  counts: { A: number; B: number };
  players: AdminPlayerRow[];
  upcoming: { no: number; text: string }[];
  result: RoundResult | null;
  standings: StandingRow[];
  winners: PlayerPublic[];
  questionBankSize: number;
}

export interface HistoryEntry {
  id: string;
  startedAt: number;
  endedAt: number;
  rounds: number;
  players: number;
  winners: string[];
  top: { rank: number; name: string; label: string }[];
}

export function initials(name: string): string {
  const s = name.trim();
  return s ? Array.from(s).slice(0, 2).join('').toUpperCase() : '?';
}
