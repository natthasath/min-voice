import type { StandingRow } from '../../shared/types';
import { Avatar } from '../components/Avatar';

const ROW_LIMIT = 7;

/** Top rows of the standings, always including the viewer's own row. */
export function RankList({ rows, meId, all = false }: { rows: StandingRow[]; meId: string; all?: boolean }) {
  let shown = all ? rows : rows.slice(0, ROW_LIMIT);
  const mine = rows.find((r) => r.player.id === meId);
  if (mine && !shown.includes(mine)) shown = [...shown, mine];

  return (
    <div className="rank-list">
      <div className="row-between" style={{ padding: '0 4px 8px', fontSize: 12, color: 'var(--muted)' }}>
        <span>อันดับ</span>
        <span>ตกรอบที่</span>
      </div>
      {shown.map((r) => {
        const me = r.player.id === meId;
        return (
          <div key={r.player.id} className={`rank-row${me ? ' me' : ''}`}>
            <span className="rank-no">{r.rank}</span>
            <Avatar name={r.player.name} color={r.player.color} size={30} radius={9} fontSize={11} />
            <span className="rank-name">
              {r.player.name}
              {me && ' (คุณ)'}
            </span>
            <span className="rank-label">{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}
