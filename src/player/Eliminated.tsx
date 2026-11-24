import type { PlayerPublic, PlayerView } from '../../shared/types';
import { Tally } from './Tally';

interface Props {
  view: PlayerView;
  me: PlayerPublic;
  onStandings: () => void;
}

export function Eliminated({ view, me, onStandings }: Props) {
  const result = view.result!;
  const justOut = me.eliminatedRound === result.round;
  const survivedRounds = me.eliminatedRound !== null ? me.eliminatedRound - 1 : null;

  let eyebrow: string;
  let title: string;
  let body: React.ReactNode;
  if (justOut && view.myAnswer) {
    eyebrow = 'คุณอยู่ฝั่งเสียงข้างมาก';
    title = 'ตกรอบแล้ว';
    body = (
      <>
        คนส่วนใหญ่คิดเหมือนคุณ
        <br />
        และในเกมนี้ นั่นคือปัญหา
      </>
    );
  } else if (justOut) {
    eyebrow = 'คุณไม่ได้ตอบทันเวลา';
    title = 'ตกรอบแล้ว';
    body = 'การไม่เลือกฝั่งนับเป็นการตกรอบ';
  } else {
    eyebrow = 'โหมดผู้ชม';
    title = result.outcome === 'void' ? 'เสมอ · ทุกคนรอด' : `${result.survivors.length} คนรอดไปต่อ`;
    body =
      result.outcome === 'void'
        ? 'ไม่มีเสียงข้างน้อยในรอบนี้ ทุกคนเล่นรอบใหม่'
        : `ตกรอบเพิ่ม ${result.eliminatedIds.length} คนในรอบนี้`;
  }

  return (
    <div className="dark-page">
      <div className="phone dark">
        <div className="row-between">
          <span className="meta">
            ผลรอบที่ <b>{result.round}</b>
          </span>
          <span className="meta">โหมดผู้ชม</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--dark-muted)', letterSpacing: '0.04em' }}>{eyebrow}</span>
          <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {title}
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: 'var(--dark-body)' }}>{body}</p>
        </div>

        <Tally result={result} myAnswer={view.myAnswer} />

        {!me.spectator && survivedRounds !== null && (
          <div className="stat-grid">
            <div className="stat">
              <span>อันดับปัจจุบัน</span>
              <span>#{view.myRank ?? '—'}</span>
            </div>
            <div className="stat">
              <span>อยู่รอดได้</span>
              <span>
                {survivedRounds} <small>รอบ</small>
              </span>
            </div>
          </div>
        )}

        <div className="spacer" />
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--dark-muted)', textAlign: 'center' }}>
          คุณยังอยู่ในห้องและดูผลแต่ละรอบได้
          <br />
          อันดับสุดท้ายจะประกาศเมื่อเหลือผู้ชนะ 1 คน
        </p>
        <button type="button" className="btn btn-dark-outline" onClick={onStandings}>
          ดูกระดานอันดับ
        </button>
      </div>
    </div>
  );
}
