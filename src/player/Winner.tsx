import type { PlayerPublic, PlayerView } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { RankList } from './RankList';

export function Winner({ view, me }: { view: PlayerView; me: PlayerPublic }) {
  const winners = view.winners;
  const solo = winners.length === 1 ? winners[0] : null;

  return (
    <div className="phone" style={{ gap: 24 }}>
      <div className="row-between">
        <span className="meta">จบเกม · {view.round} รอบ</span>
        <span className="meta">{view.totalPlayers} ผู้เล่น</span>
      </div>

      <div className="winner-card">
        {solo ? (
          <>
            <span className="winner-eyebrow">ผู้รอดคนสุดท้าย</span>
            <Avatar name={solo.name} color={solo.color} size={88} radius={26} fontSize={32} />
            <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {solo.name}
              {solo.id === me.id && ' (คุณ)'}
            </span>
            <span style={{ fontSize: 14, color: 'var(--dark-body)' }}>
              อยู่เสียงข้างน้อยครบทั้ง {view.round} รอบ
            </span>
          </>
        ) : (
          <>
            <span className="winner-eyebrow">ผู้รอด {winners.length} คน</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
              {winners.slice(0, 8).map((p) => (
                <Avatar key={p.id} name={p.name} color={p.color} size={48} radius={14} fontSize={17} />
              ))}
            </div>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{winners.map((p) => p.name).join(' · ')}</span>
            <span style={{ fontSize: 14, color: 'var(--dark-body)' }}>เกมจบก่อนเหลือผู้รอดคนเดียว</span>
          </>
        )}
      </div>

      <RankList rows={view.standings} meId={me.id} />

      <div className="spacer" />
      <div className="status-pill">
        <span className="live-dot" />
        รอเกมใหม่
      </div>
    </div>
  );
}
