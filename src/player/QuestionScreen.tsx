import type { Choice, PlayerPublic, PlayerView } from '../../shared/types';
import { Check } from '../components/Icons';
import { useRemaining } from '../lib/clock';

const RING = 2 * Math.PI * 54;

interface Props {
  view: PlayerView;
  me: PlayerPublic;
  onAnswer: (choice: Choice) => void;
}

export function QuestionScreen({ view, me, onAnswer }: Props) {
  const q = view.question!;
  const leftMs = useRemaining(q.endsAt);
  const seconds = Math.ceil(leftMs / 1000);
  const total = Math.max(q.seconds * 1000, leftMs);
  const timeUp = leftMs <= 0;
  const canAnswer = me.alive && !timeUp;
  const live = view.liveCounts;
  const liveTotal = live ? live.A + live.B : 0;

  const hint = !me.alive
    ? 'คุณอยู่ในโหมดผู้ชม · รอดูผลรอบนี้'
    : timeUp
      ? 'หมดเวลา · กำลังประกาศผล…'
      : view.myAnswer
        ? 'ล็อกคำตอบแล้ว · เปลี่ยนได้จนกว่าจะหมดเวลา'
        : 'คิดให้ดี คนส่วนใหญ่จะเลือกฝั่งไหน?';

  // Spectators get the dark screen they already see on results, so the mode is obvious at a glance.
  const screen = (
    <div className={me.alive ? 'phone' : 'phone dark'}>
      <div className="row-between">
        <span className="meta">
          รอบที่ <b>{view.round}</b>
          {!me.alive && <span className="spectator-tag">โหมดผู้ชม</span>}
        </span>
        <span className="meta">
          เหลือ <b>{view.aliveCount}</b> / {view.totalPlayers} คน
        </span>
      </div>

      <div className="timer">
        <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="54" fill="none" stroke={me.alive ? 'var(--line)' : 'var(--dark-line)'} strokeWidth="6" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={seconds <= view.warnSeconds ? 'var(--accent)' : me.alive ? 'var(--ink)' : '#fff'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - leftMs / total)}
            style={{ transition: 'stroke-dashoffset 0.2s linear' }}
          />
        </svg>
        <div className="timer-num" role="timer" aria-label={`เหลือเวลา ${seconds} วินาที`}>
          <span>{seconds}</span>
          <span>วินาที</span>
        </div>
      </div>

      <h1 className="question-title">{q.text}</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(['A', 'B'] as const).map((key) => {
          const selected = view.myAnswer === key;
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                className="choice"
                aria-pressed={selected}
                disabled={!canAnswer}
                onClick={() => onAnswer(key)}
              >
                <span className="choice-key">{key}</span>
                <span className="choice-label">{key === 'A' ? q.a : q.b}</span>
                {selected && <Check />}
              </button>
              {live && (
                <div className="bar-track" style={{ height: 6 }} aria-label={`${key}: ${live[key]} คน`}>
                  <div
                    className="bar-fill"
                    style={{ width: `${liveTotal ? (live[key] / liveTotal) * 100 : 0}%`, background: 'var(--bar)' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {view.liveGap !== null && (
        <div className="live-gap" aria-live="polite">
          <span className="live-gap-label">ผลต่าง</span>
          <span className="live-gap-num">{view.liveGap}</span>
          <span className="live-gap-label">คน</span>
        </div>
      )}

      <div className="spacer" />

      <p className="lede" style={{ textAlign: 'center', fontSize: 14 }} aria-live="polite">
        {hint}
      </p>
    </div>
  );
  return me.alive ? screen : <div className="dark-page">{screen}</div>;
}
