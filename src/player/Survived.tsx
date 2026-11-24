import type { PlayerPublic, PlayerView } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { Check, Equal } from '../components/Icons';
import { Tally } from './Tally';

const SURVIVOR_LIMIT = 10;

export function Survived({ view, me }: { view: PlayerView; me: PlayerPublic }) {
  const result = view.result!;
  const isVoid = result.outcome === 'void';
  /** A void round can still eliminate players who didn't answer. */
  const allSurvived = isVoid && result.eliminatedIds.length === 0;
  const others = result.survivors.length - 1;
  const shown = result.survivors.slice(0, SURVIVOR_LIMIT);
  const more = result.survivors.length - shown.length;

  return (
    <div className="phone">
      <div className="row-between">
        <span className="meta">
          ผลรอบที่ <b>{result.round}</b>
        </span>
        <span className="meta">
          เหลือ <b>{view.aliveCount}</b> / {view.totalPlayers} คน
        </span>
      </div>

      <div className="result-head">
        <div className={`result-badge${isVoid ? ' neutral' : ''}`}>{isVoid ? <Equal /> : <Check size={34} />}</div>
        <h1 className="result-title">{allSurvived ? 'ทุกคนรอด' : 'คุณรอด'}</h1>
        <p className="lede">
          {isVoid ? (
            <>
              ไม่มีเสียงข้างน้อยในรอบนี้
              <br />
              {allSurvived ? 'ทุกคนไปต่อ เล่นรอบใหม่' : 'ทุกคนที่ตอบได้ไปต่อ เล่นรอบใหม่'}
            </>
          ) : (
            <>
              คุณอยู่ฝั่ง<b style={{ color: 'var(--accent)', fontWeight: 600 }}>เสียงข้างน้อย</b>
              <br />
              {others > 0 ? `ไปต่อรอบถัดไปพร้อมอีก ${others} คน` : 'คุณคือผู้รอดคนสุดท้าย!'}
            </>
          )}
        </p>
      </div>

      <Tally result={result} myAnswer={view.myAnswer} />

      {!isVoid && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">ผู้รอดรอบนี้</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {shown.map((p) => (
              <span key={p.id} title={p.name}>
                <Avatar name={p.name} color={p.color} size={40} radius={12} fontSize={13} />
                <span className="sr-only">{p.name}</span>
              </span>
            ))}
            {more > 0 && (
              <span className="meta" style={{ alignSelf: 'center', paddingLeft: 4 }}>
                +{more}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="spacer" />
      <p className="lede" style={{ textAlign: 'center', fontSize: 14 }}>
        {me.alive && view.aliveCount <= 1 ? 'รอแอดมินประกาศผู้ชนะ…' : 'รอแอดมินเปิดคำถามถัดไป…'}
      </p>
    </div>
  );
}
