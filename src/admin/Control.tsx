import { useCallback, useEffect, useRef, useState } from 'react';
import { SECONDS_MAX, SECONDS_MIN, type AdminView } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { Audience } from './Audience';
import { Stop } from '../components/Icons';
import { useRemaining } from '../lib/clock';
import { load, save } from '../lib/storage';

const PLAYER_PREVIEW = 8;
/** Per-device: this browser may be the one wired to the projector. */
const AUTO_PRESENT_KEY = 'minvoice.autoPresent';

interface Props {
  view: AdminView;
  emit: (event: string, ...args: unknown[]) => void;
}

interface StageProps extends Props {
  autoPresent: boolean;
  setAutoPresent: (on: boolean) => void;
  onPresent: () => void;
  /** Opens the next question, switching to the audience screen first when auto-present is on. */
  onNext: () => void;
}

function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Control({ view, emit }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [autoPresent, setAutoPresentState] = useState(() => load(AUTO_PRESENT_KEY) !== 'off');

  const setAutoPresent = (on: boolean) => {
    setAutoPresentState(on);
    save(AUTO_PRESENT_KEY, on ? null : 'off');
  };

  // Fullscreen needs the click's user gesture, so it is requested here rather than when the question arrives.
  const present = () => {
    setPresenting(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const stopPresenting = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  // Back to the admin screen as soon as the question closes (time up, closed or skipped).
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (prevPhase.current === 'question' && view.phase !== 'question') stopPresenting();
    prevPhase.current = view.phase;
  }, [view.phase, stopPresenting]);

  /** Starts the game or the next question; the audience screen shows the moment it opens. */
  const openQuestion = (event: 'admin:start' | 'admin:next') => {
    if (autoPresent) present();
    emit(event, (err: string | null) => {
      setError(err);
      if (err) stopPresenting();
    });
  };
  const start = () => openQuestion('admin:start');

  if (presenting && view.phase === 'question' && view.question) {
    return <Audience view={view} onExit={stopPresenting} />;
  }

  const statusText = {
    lobby: 'รอผู้เล่น',
    question: `กำลังตอบ · รอบ ${view.round}`,
    result: `ประกาศผล · รอบ ${view.round}`,
    finished: 'จบเกม',
  }[view.phase];

  const eliminated = view.totalPlayers - view.aliveCount;

  return (
    <>
      <div className="kpis">
        <div className="card kpi">
          <span>สถานะ</span>
          <span className="kpi-status">
            <i className={view.phase === 'question' ? '' : 'idle'} />
            {statusText}
          </span>
        </div>
        <div className="card kpi">
          <span>ผู้เล่นทั้งหมด</span>
          <span className="kpi-value">{view.totalPlayers}</span>
        </div>
        <div className="card kpi">
          <span>ยังอยู่ในเกม</span>
          <span className="kpi-value">{view.aliveCount}</span>
        </div>
        <div className="card kpi">
          <span>ตอบแล้วรอบนี้</span>
          <span className="kpi-value">
            {view.phase === 'question' ? view.answeredCount : '—'} <small>/ {view.aliveCount}</small>
          </span>
        </div>
      </div>

      <div className="split">
        <section className="card stage split-main" aria-label="เวที">
          <Stage
            view={view}
            emit={emit}
            autoPresent={autoPresent}
            setAutoPresent={setAutoPresent}
            onPresent={present}
            onNext={() => openQuestion('admin:next')}
          />
        </section>

        <aside className="split-side">
          {view.phase === 'lobby' && (
            <section className="panel panel-dark">
              <span className="muted">ก่อนเริ่มเกม (สถานะห้องรอ)</span>
              <span style={{ fontSize: 15, lineHeight: 1.6 }}>
                เมื่อผู้เล่นเข้าห้องครบ กดเริ่มเพื่อส่งคำถามแรกไปยังทุกจอพร้อมกัน
              </span>
              <button type="button" className="btn btn-md btn-accent" style={{ fontSize: 16 }} onClick={start}>
                เริ่มเกม
              </button>
              {error && (
                <span role="alert" style={{ fontSize: 14, color: 'var(--dark-accent-soft)' }}>
                  {error}
                </span>
              )}
            </section>
          )}

          {view.phase === 'finished' && (
            <section className="panel panel-dark">
              <span className="muted">เกมจบแล้ว</span>
              <span style={{ fontSize: 15, lineHeight: 1.6 }}>
                เริ่มห้องใหม่ ผู้เล่นที่ยังเชื่อมต่ออยู่จะกลับไปที่ห้องรอโดยอัตโนมัติ
              </span>
              <button
                type="button"
                className="btn btn-md btn-accent"
                style={{ fontSize: 16 }}
                onClick={() => emit('admin:reset')}
              >
                เริ่มเกมใหม่
              </button>
            </section>
          )}

          <PlayersPanel view={view} eliminated={eliminated} />

          {view.phase !== 'finished' && (
            <section className="card panel" style={{ gap: 12 }}>
              <h2>คิวคำถามถัดไป</h2>
              {view.upcoming.length === 0 ? (
                <span className="meta">ไม่มีคำถามเหลือในคิว</span>
              ) : (
                view.upcoming.map((q) => (
                  <div key={q.no} className="queue-item">
                    {q.no} · {q.text}
                  </div>
                ))
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function Stage(props: StageProps) {
  const { view, emit, onPresent, onNext } = props;
  const q = view.question;
  const left = useRemaining(view.phase === 'question' ? q?.endsAt : null);
  const lastRound = view.aliveCount <= 1 || view.upcoming.length === 0;

  if (view.phase === 'lobby') {
    return (
      <>
        <span className="label" style={{ color: 'var(--muted)' }}>
          ยังไม่เริ่มเกม · คำถามในคลัง {view.questionBankSize} ข้อ
        </span>
        <h1 className="stage-title">
          {view.totalPlayers < 2
            ? 'รอผู้เล่นเข้าห้องอย่างน้อย 2 คน'
            : `มีผู้เล่นพร้อมแล้ว ${view.totalPlayers} คน`}
        </h1>
        <p className="meta" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
          ให้ผู้เล่นเปิดลิงก์เข้าห้องบนมือถือ (ปุ่มคัดลอกด้านบน) แล้วสร้างโปรไฟล์ จากนั้นกด “เริ่มเกม”
        </p>
        <GameSettingsPanel {...props} />
      </>
    );
  }

  if (view.phase === 'finished') {
    const top = view.standings.slice(0, 10);
    return (
      <>
        <span className="label" style={{ color: 'var(--muted)' }}>
          จบเกม · {view.round} รอบ
        </span>
        <h1 className="stage-title">
          {view.winners.length === 1
            ? `ผู้ชนะ: ${view.winners[0].name}`
            : view.winners.length > 1
              ? `ผู้รอด ${view.winners.length} คน`
              : 'จบเกม'}
        </h1>
        <div className="rank-list">
          {top.map((r) => (
            <div key={r.player.id} className="rank-row">
              <span className="rank-no">{r.rank}</span>
              <Avatar name={r.player.name} color={r.player.color} size={30} radius={9} fontSize={11} />
              <span className="rank-name">{r.player.name}</span>
              <span className="rank-label">{r.label}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  // question or result
  const result = view.phase === 'result' ? view.result : null;
  const counts = result ? result.counts : view.counts;
  const total = counts.A + counts.B;

  return (
    <>
      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <span className="label" style={{ color: 'var(--muted)' }}>
          คำถามรอบที่ {view.round} · หมวด {q?.cat}
        </span>
        {result ? (
          <span className="stage-clock" style={{ color: 'var(--ink)', fontSize: 20 }}>
            {result.outcome === 'void' && result.eliminatedIds.length === 0
              ? 'เสมอ · ทุกคนรอด'
              : `${result.outcome === 'void' ? 'เสมอ · ' : ''}ตกรอบ ${result.eliminatedIds.length} คน`}
          </span>
        ) : (
          <span className="stage-clock" role="timer">
            {clock(left)}
          </span>
        )}
      </div>
      <h1 className="stage-title">{q?.text}</h1>

      <div className="option-grid">
        {(['A', 'B'] as const).map((key) => {
          const n = counts[key];
          const pct = total ? Math.round((n / total) * 100) : 0;
          const win = result?.outcome === key;
          return (
            <div key={key} className={`option${win ? ' win' : ''}`}>
              <div className="option-head">
                <span>
                  {key} · {key === 'A' ? q?.a : q?.b}
                </span>
                <span>{n}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${pct}%`, background: key === 'A' ? 'var(--ink)' : 'var(--accent)' }}
                />
              </div>
              <span className="meta">
                {pct}% ของคนที่ตอบแล้ว
                {result && result.outcome !== 'void' && (win ? ' · เสียงข้างน้อย รอด' : ' · เสียงข้างมาก ตกรอบ')}
              </span>
            </div>
          );
        })}
      </div>

      {result && result.noAnswer > 0 && (
        <span className="meta">
          ไม่ได้ตอบ {result.noAnswer} คน{result.counts.A + result.counts.B > 0 ? ' (ตกรอบ)' : ''}
        </span>
      )}

      <GameSettingsPanel {...props} />

      <div className="toolbar">
        {view.phase === 'question' ? (
          <>
            <button type="button" className="btn btn-md" onClick={() => emit('admin:close')}>
              <Stop />
              ปิดรับคำตอบ &amp; ประกาศผล
            </button>
            <button type="button" className="btn btn-md btn-outline" onClick={() => emit('admin:extend')}>
              +10 วินาที
            </button>
            <button type="button" className="btn btn-md btn-outline" onClick={() => emit('admin:skip')}>
              ข้ามคำถามนี้
            </button>
            <button type="button" className="btn btn-md btn-outline" onClick={onPresent}>
              แสดงจอผู้ชม
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-md" onClick={lastRound ? () => emit('admin:next') : onNext}>
            {lastRound ? 'ประกาศผู้ชนะ' : 'คำถามถัดไป'}
          </button>
        )}
        <div className="spacer" />
        <button
          type="button"
          className="btn btn-md btn-ghost-danger"
          onClick={() => {
            if (window.confirm('จบเกมตอนนี้เลยหรือไม่? ผู้ที่ยังอยู่ทั้งหมดจะเป็นผู้ชนะร่วม')) emit('admin:end');
          }}
        >
          จบเกม
        </button>
      </div>
    </>
  );
}

function GameSettingsPanel({ view, emit, autoPresent, setAutoPresent }: StageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label className="check">
        <input type="checkbox" checked={autoPresent} onChange={(e) => setAutoPresent(e.target.checked)} />
        เปิดจอผู้ชมเต็มจอทันทีเมื่อเริ่มคำถาม (สำหรับขึ้นจอ ไม่แสดงคะแนน)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={view.settings.shuffle}
          disabled={view.phase !== 'lobby'}
          onChange={(e) => emit('admin:settings', { shuffle: e.target.checked })}
        />
        สุ่มลำดับคำถาม{view.phase !== 'lobby' ? ' (ตั้งได้ก่อนเริ่มเกม)' : ''}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={view.settings.hideLive}
          onChange={(e) => emit('admin:settings', { hideLive: e.target.checked })}
        />
        ซ่อนคะแนนสดจากจอผู้เล่นจนกว่าจะหมดเวลา
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={view.settings.liveNumbers}
          onChange={(e) => emit('admin:settings', { liveNumbers: e.target.checked })}
        />
        แสดงผลต่างของคำตอบแบบสดบนจอผู้เล่น (ไม่บอกว่าฝั่งไหนนำ)
      </label>
      <FixedSecondsSetting view={view} emit={emit} />
      <WarnSecondsSetting view={view} emit={emit} />
    </div>
  );
}

/**
 * A digits-only seconds box (no spin buttons) that saves on Enter or blur, clamped to [min, max].
 * Clearing it saves null when `emptyMeans` is given (shown as the placeholder); otherwise it keeps the value.
 */
function SecondsInput(props: {
  value: number | null;
  min: number;
  max: number;
  label: string;
  emptyMeans?: string;
  onCommit: (n: number | null) => void;
}) {
  const { value, min, max, label, emptyMeans, onCommit } = props;
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft === '') {
      if (emptyMeans !== undefined && value !== null) onCommit(null);
      return;
    }
    const clamped = Math.min(max, Math.max(min, Number(draft)));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      className="input"
      type="text"
      inputMode="numeric"
      maxLength={2}
      aria-label={label}
      placeholder={emptyMeans}
      style={{ width: 56, height: 40, padding: 0, borderRadius: 10, textAlign: 'center' }}
      value={draft ?? value ?? ''}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

function FixedSecondsSetting({ view, emit }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span className="check">เวลาตอบทุกข้อ</span>
      <SecondsInput
        value={view.settings.fixedSeconds}
        min={SECONDS_MIN}
        max={SECONDS_MAX}
        label="เวลาตอบทุกข้อ (วินาที)"
        emptyMeans="–"
        onCommit={(n) => emit('admin:settings', { fixedSeconds: n })}
      />
      <span className="meta" style={{ fontSize: 13 }}>
        วินาที ({SECONDS_MIN}–{SECONDS_MAX} · เว้นว่าง = ใช้เวลาของแต่ละข้อ)
        {view.phase === 'question' ? ' · มีผลตั้งแต่ข้อถัดไป' : ''}
      </span>
    </div>
  );
}

function WarnSecondsSetting({ view, emit }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span className="check">นาฬิกาผู้เล่นเปลี่ยนเป็นสีส้มใน</span>
      <SecondsInput
        value={view.settings.warnSeconds}
        min={0}
        max={SECONDS_MAX}
        label="เปลี่ยนสีนาฬิกาเมื่อเหลือ (วินาที)"
        onCommit={(n) => n !== null && emit('admin:settings', { warnSeconds: n })}
      />
      <span className="meta" style={{ fontSize: 13 }}>
        วินาทีสุดท้าย (0 = ไม่เปลี่ยนสี)
      </span>
    </div>
  );
}

function PlayersPanel({ view, eliminated }: { view: AdminView; eliminated: number }) {
  const [all, setAll] = useState(false);
  const rows = all ? view.players : view.players.slice(0, PLAYER_PREVIEW);

  const status = (p: AdminView['players'][number]) => {
    if (!p.alive) return `ตกรอบ ${p.eliminatedRound}`;
    if (view.phase === 'question') return p.answered ? 'ตอบแล้ว' : 'ยังไม่ตอบ';
    if (view.phase === 'finished') return 'ชนะ';
    return view.phase === 'lobby' ? 'พร้อม' : 'รอด';
  };

  return (
    <section className="card panel">
      <div className="row-between">
        <h2>ผู้เล่น</h2>
        <span className="meta">
          {view.phase === 'lobby' ? `${view.totalPlayers} คนในห้อง` : `${view.aliveCount} รอด · ${eliminated} ตกรอบ`}
        </span>
      </div>
      {view.players.length === 0 && <span className="meta">ยังไม่มีผู้เล่น</span>}
      {rows.map((p) => (
        <div key={p.id} className={`player-row${p.alive ? '' : ' out'}`}>
          <Avatar name={p.name} color={p.color} size={30} radius={9} fontSize={11} />
          <span className="name">
            {p.name}
            {!p.online && <span className="offline-dot" title="ออฟไลน์" aria-label="ออฟไลน์" />}
          </span>
          <span className="status">{status(p)}</span>
        </div>
      ))}
      {view.players.length > PLAYER_PREVIEW && (
        <button type="button" className="link-btn" onClick={() => setAll(!all)}>
          {all ? 'แสดงน้อยลง' : `ดูทั้งหมด ${view.players.length} คน`}
        </button>
      )}
    </section>
  );
}
