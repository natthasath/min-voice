import { useEffect } from 'react';
import type { AdminView } from '../../shared/types';
import { useRemaining } from '../lib/clock';

const RING = 2 * Math.PI * 54;

/**
 * Full-screen question view for projecting to the room. It never shows scores, only how many have
 * answered; the parent closes it once the question ends.
 */
export function Audience({ view, onExit }: { view: AdminView; onExit: () => void }) {
  const q = view.question!;
  const leftMs = useRemaining(q.endsAt);
  const seconds = Math.ceil(leftMs / 1000);
  const total = Math.max(q.seconds * 1000, leftMs);
  const { settings } = view;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onExit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <div className="audience dark" role="dialog" aria-modal="true" aria-label="จอผู้ชม">
      <div className="audience-inner">
        <div className="row-between">
          <span className="meta">
            รอบที่ <b>{view.round}</b> · หมวด {q.cat}
          </span>
          <button type="button" className="audience-exit" onClick={onExit}>
            กลับหน้า admin (Esc)
          </button>
        </div>

        <div className="timer audience-timer">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--dark-line)" strokeWidth="6" />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke={seconds <= settings.warnSeconds ? 'var(--accent)' : '#fff'}
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

        <h1 className="audience-title">{q.text}</h1>

        <div className="audience-choices">
          {(['A', 'B'] as const).map((key) => (
            <div key={key} className="audience-choice">
              <div className="choice" aria-disabled="true">
                <span className="choice-key">{key}</span>
                <span className="choice-label">{key === 'A' ? q.a : q.b}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="meta" style={{ margin: 0, textAlign: 'center', fontSize: 18 }} aria-live="polite">
          ตอบแล้ว <b>{view.answeredCount}</b> / {view.aliveCount} คน
        </p>
      </div>
    </div>
  );
}
