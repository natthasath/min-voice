import type { PlayerPublic, PlayerView } from '../../shared/types';
import { Avatar } from '../components/Avatar';

interface Props {
  view: PlayerView;
  me: PlayerPublic;
  onEdit: () => void;
}

export function PinMeta({ pin }: { pin: string }) {
  return (
    <span className="meta">
      ห้อง <b>{pin.slice(0, 3)} {pin.slice(3)}</b>
    </span>
  );
}

export function Lobby({ view, me, onEdit }: Props) {
  const others = view.totalPlayers - view.recent.length;
  return (
    <div className="phone">
      <div className="row-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={me.name} color={me.color} size={40} radius={12} fontSize={15} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{me.name}</span>
            <button
              type="button"
              className="link-btn"
              style={{ fontSize: 12, color: 'var(--muted)' }}
              onClick={onEdit}
            >
              คุณพร้อมแล้ว · แก้ไขโปรไฟล์
            </button>
          </div>
        </div>
        <PinMeta pin={view.pin} />
      </div>

      <div
        className="card"
        style={{
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          textAlign: 'center',
        }}
      >
        <div className="meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot" />
          รอแอดมินเริ่มเกม
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }} aria-live="polite">
          {view.totalPlayers}
        </div>
        <div className="lede">ผู้เล่นในห้องตอนนี้</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="label">เพิ่งเข้ามา</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {view.recent.map((p) => (
            <span key={p.id} className="chip">
              <Avatar name={p.name} color={p.color} size={28} radius="50%" fontSize={11} />
              {p.name}
            </span>
          ))}
          {others > 0 && (
            <span className="chip" style={{ border: 0, background: 'none', color: 'var(--muted)', paddingLeft: 12 }}>
              +{others} คน
            </span>
          )}
        </div>
      </div>

      <div className="spacer" />

      <div className="steps">
        <span className="label">วิธีเล่น</span>
        <div className="step">
          <b>1</b>
          <span>แต่ละรอบมีคำถามพร้อม 2 ตัวเลือก ตอบภายในเวลาที่กำหนด</span>
        </div>
        <div className="step">
          <b>2</b>
          <span>
            เลือกฝั่งที่คิดว่าคนอื่นจะเลือก<b style={{ color: 'var(--accent)', fontWeight: 600 }}>น้อยกว่า</b>
          </span>
        </div>
        <div className="step">
          <b>3</b>
          <span>ฝั่งเสียงข้างมากตกรอบ คนสุดท้ายที่เหลือคือผู้ชนะ</span>
        </div>
      </div>
    </div>
  );
}
