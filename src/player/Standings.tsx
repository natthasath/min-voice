import type { PlayerPublic, PlayerView } from '../../shared/types';
import { RankList } from './RankList';

interface Props {
  view: PlayerView;
  me: PlayerPublic;
  onBack: () => void;
}

export function Standings({ view, me, onBack }: Props) {
  return (
    <div className="phone" style={{ gap: 24 }}>
      <div className="row-between">
        <span className="meta">
          กระดานอันดับ · รอบ <b>{view.round}</b>
        </span>
        <span className="meta">
          เหลือ <b>{view.aliveCount}</b> / {view.totalPlayers} คน
        </span>
      </div>
      <h1 className="headline" style={{ fontSize: 28 }}>
        อันดับตอนนี้
      </h1>
      <RankList rows={view.standings} meId={me.id} all />
      <div className="spacer" />
      <button type="button" className="btn" onClick={onBack}>
        กลับไปดูผลรอบนี้
      </button>
    </div>
  );
}
