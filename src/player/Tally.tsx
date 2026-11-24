import type { Choice, RoundResult } from '../../shared/types';

interface Props {
  result: RoundResult;
  myAnswer: Choice | null;
}

/** Per-choice result bars, shared by the survived / eliminated screens (inherits light or dark from `.phone`). */
export function Tally({ result, myAnswer }: Props) {
  const { counts, outcome, question } = result;
  const total = counts.A + counts.B;
  return (
    <div className="card tally">
      <p className="tally-q">{question.text}</p>
      {(['A', 'B'] as const).map((key) => {
        const n = counts[key];
        const pct = total ? Math.round((n / total) * 100) : 0;
        const win = outcome === key;
        const note =
          outcome === 'void' ? 'เสมอ · รอดทั้งสองฝั่ง' : win ? 'เสียงข้างน้อย · รอด' : 'เสียงข้างมาก · ตกรอบ';
        return (
          <div key={key} className="tally-row">
            <div className="row-between">
              <span>
                <b>{key}</b> · {key === 'A' ? question.a : question.b}
                {myAnswer === key && <span className="you-tag">คุณ</span>}
              </span>
              <span style={win ? { fontWeight: 600 } : { opacity: 0.75 }}>
                {n} คน · {pct}%
              </span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%`, background: win ? 'var(--accent)' : 'var(--bar)' }} />
            </div>
            <span className={`tally-note${win ? ' win' : ''}`}>{note}</span>
          </div>
        );
      })}
      {result.noAnswer > 0 && (
        <span className="tally-note">
          ไม่ได้ตอบ {result.noAnswer} คน{total > 0 ? ' · ตกรอบ' : ''}
        </span>
      )}
    </div>
  );
}
