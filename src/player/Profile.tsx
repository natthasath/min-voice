import { useState } from 'react';
import { isPaletteColor, NAME_MAX, PALETTE, type Phase, type PlayerPublic } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { ArrowRight, Shuffle } from '../components/Icons';
import { Logo } from '../components/Logo';
import { load, save } from '../lib/storage';
import { PinMeta } from './Lobby';

interface Props {
  pin: string;
  me: PlayerPublic | null;
  phase: Phase;
  onSubmit: (name: string, color: string) => Promise<string | null>;
}

export function Profile({ pin, me, phase, onSubmit }: Props) {
  const [name, setName] = useState(me?.name ?? load('minvoice.name') ?? '');
  const [color, setColor] = useState(() => {
    // A color saved before the palette changed may no longer exist.
    const saved = me?.color ?? load('minvoice.color');
    return isPaletteColor(saved) ? saved : PALETTE[0].hex;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const randomColor = () => {
    const others = PALETTE.filter((p) => p.hex !== color);
    setColor(others[Math.floor(Math.random() * others.length)].hex);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError('กรุณาใส่ชื่อเล่น');
      return;
    }
    setBusy(true);
    save('minvoice.name', clean);
    save('minvoice.color', color);
    const err = await onSubmit(clean, color);
    setBusy(false);
    setError(err);
  };

  return (
    <form className="phone" style={{ gap: 32 }} onSubmit={submit} noValidate>
      <div className="row-between">
        <Logo />
        <PinMeta pin={pin} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 className="headline">
          อยู่ฝั่งที่คน<span className="accent">น้อยกว่า</span>
          <br />
          แล้วคุณจะรอด
        </h1>
        <p className="lede">
          {phase === 'lobby'
            ? 'สร้างโปรไฟล์ก่อนเข้าเกม ชื่อนี้จะแสดงบนกระดานอันดับ'
            : 'เกมกำลังดำเนินอยู่ คุณจะเข้าชมในโหมดผู้ชม และได้เล่นในเกมถัดไป'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} color={color} size={112} radius={32} fontSize={40} />
        <span className="meta">ตัวอย่างโปรไฟล์</span>
      </div>

      <div className="field">
        <label htmlFor="nick">ชื่อเล่น</label>
        <input
          id="nick"
          className="input"
          style={{ fontSize: 17 }}
          type="text"
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น ฝ้าย"
          autoComplete="nickname"
        />
      </div>

      <div role="group" aria-labelledby="color-label" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row-between">
          <span id="color-label" className="label">
            สีประจำตัว
          </span>
          <button type="button" className="btn btn-outline random-btn" onClick={randomColor}>
            <Shuffle />
            สุ่มสี
          </button>
        </div>
        <div className="swatches">
          {PALETTE.map((p) => (
            <button
              key={p.hex}
              type="button"
              className="swatch"
              aria-label={`สี${p.name}`}
              aria-pressed={color === p.hex}
              onClick={() => setColor(p.hex)}
              style={{ '--swatch': p.hex } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="spacer" />

      <button type="submit" className="btn" disabled={busy}>
        {me ? 'บันทึกโปรไฟล์' : 'เข้าเกม'}
        <ArrowRight />
      </button>
    </form>
  );
}
