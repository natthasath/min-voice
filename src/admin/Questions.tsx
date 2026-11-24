import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, SECONDS_MAX, SECONDS_MIN, type Question } from '../../shared/types';
import { Plus } from '../components/Icons';
import { api, ApiError } from '../lib/api';

const SAVE_DELAY_MS = 500;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function Questions({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [qs, setQs] = useState<Question[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({ state: 'idle' });
  const pending = useRef<{ id: string; timer: ReturnType<typeof setTimeout>; patch: Partial<Question> } | null>(null);

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onUnauthorized();
    else setSave({ state: 'error', message: (e as Error).message });
  };

  useEffect(() => {
    api<Question[]>('GET', '/api/admin/questions')
      .then((list) => {
        setQs(list);
        setSelId(list[0]?.id ?? null);
      })
      .catch(fail);
    return () => {
      // flush unsaved edits when leaving the page
      if (pending.current) {
        clearTimeout(pending.current.timer);
        api('PUT', `/api/admin/questions/${pending.current.id}`, pending.current.patch).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!qs) return <p className="meta">กำลังโหลด…</p>;

  const sel = qs.find((q) => q.id === selId) ?? null;
  const selIndex = sel ? qs.indexOf(sel) : -1;

  const flush = () => {
    const p = pending.current;
    if (!p) return Promise.resolve();
    clearTimeout(p.timer);
    pending.current = null;
    setSave({ state: 'saving' });
    return api<Question>('PUT', `/api/admin/questions/${p.id}`, p.patch)
      .then(() => setSave({ state: 'saved' }))
      .catch(fail);
  };

  const patch = (field: keyof Omit<Question, 'id'>, value: string | number) => {
    if (!sel) return;
    setQs(qs.map((q) => (q.id === sel.id ? { ...q, [field]: value } : q)));
    if (pending.current && pending.current.id !== sel.id) flush();
    const prev = pending.current?.patch ?? {};
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = {
      id: sel.id,
      patch: { ...prev, [field]: value },
      timer: setTimeout(flush, SAVE_DELAY_MS),
    };
    setSave({ state: 'saving' });
  };

  const pick = async (id: string) => {
    await flush();
    setSelId(id);
    setSave({ state: 'idle' });
  };

  const create = async (base?: Question) => {
    await flush();
    try {
      const body = base
        ? { text: base.text, a: base.a, b: base.b, cat: base.cat, seconds: base.seconds, afterId: base.id }
        : { text: 'คำถามใหม่', a: 'ตัวเลือก A', b: 'ตัวเลือก B', cat: CATEGORIES[0], seconds: 10 };
      const created = await api<Question>('POST', '/api/admin/questions', body);
      const next = qs.slice();
      const at = base ? next.findIndex((q) => q.id === base.id) + 1 : next.length;
      next.splice(at, 0, created);
      setQs(next);
      setSelId(created.id);
      setSave({ state: 'saved' });
    } catch (e) {
      fail(e);
    }
  };

  const remove = async () => {
    if (!sel || !window.confirm(`ลบคำถามที่ ${selIndex + 1} หรือไม่?`)) return;
    if (pending.current?.id === sel.id) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
    try {
      await api('DELETE', `/api/admin/questions/${sel.id}`);
      const next = qs.filter((q) => q.id !== sel.id);
      setQs(next);
      setSelId(next[Math.max(0, selIndex - 1)]?.id ?? null);
      setSave({ state: 'idle' });
    } catch (e) {
      fail(e);
    }
  };

  const saveLabel = {
    idle: 'บันทึกอัตโนมัติ',
    saving: 'กำลังบันทึก…',
    saved: 'บันทึกแล้ว',
    error: save.message ?? 'บันทึกไม่สำเร็จ',
  }[save.state];

  return (
    <>
      <div className="row-between" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="page-title">คลังคำถาม</h1>
          <p className="meta" style={{ margin: 0, fontSize: 14 }}>
            {qs.length} คำถาม · คำถามที่ไม่มีคำตอบถูก ให้ผู้เล่นเดาใจคนส่วนใหญ่
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => create()}>
          <Plus />
          เพิ่มคำถาม
        </button>
      </div>

      <div className="split">
        <section aria-label="รายการคำถาม" className="card q-list split-list">
          {qs.length === 0 && <div className="empty">ยังไม่มีคำถาม กด “เพิ่มคำถาม” เพื่อเริ่ม</div>}
          {qs.map((q, i) => (
            <button
              key={q.id}
              type="button"
              className="q-item"
              aria-current={q.id === selId ? 'true' : undefined}
              onClick={() => pick(q.id)}
            >
              <span className="q-no">{i + 1}</span>
              <span className="q-body">
                <span className="q-text">{q.text || 'ไม่มีข้อความ'}</span>
                <span className="q-sub">
                  {q.a} / {q.b} · {q.cat} · {q.seconds} วิ
                </span>
              </span>
            </button>
          ))}
        </section>

        {sel && (
          <section aria-label="แก้ไขคำถาม" className="card editor split-main">
            <div className="row-between">
              <h2>แก้ไขคำถามที่ {selIndex + 1}</h2>
              <span
                className={save.state === 'error' ? 'error' : 'meta'}
                role="status"
                style={{ fontSize: 13 }}
              >
                {saveLabel}
              </span>
            </div>

            <div className="field">
              <label htmlFor="qtext">คำถาม</label>
              <textarea
                id="qtext"
                className="input"
                rows={3}
                maxLength={300}
                value={sel.text}
                onChange={(e) => patch('text', e.target.value)}
              />
            </div>

            <div className="grid-2">
              <div className="field">
                <label htmlFor="ca">ตัวเลือก A</label>
                <input
                  id="ca"
                  className="input"
                  maxLength={60}
                  value={sel.a}
                  onChange={(e) => patch('a', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="cb">ตัวเลือก B</label>
                <input
                  id="cb"
                  className="input"
                  maxLength={60}
                  value={sel.b}
                  onChange={(e) => patch('b', e.target.value)}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label htmlFor="cat">หมวด</label>
                <select id="cat" className="input" value={sel.cat} onChange={(e) => patch('cat', e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sec">เวลาตอบ (วินาที)</label>
                <input
                  id="sec"
                  className="input"
                  type="number"
                  min={SECONDS_MIN}
                  max={SECONDS_MAX}
                  value={sel.seconds}
                  onChange={(e) => patch('seconds', Number(e.target.value))}
                />
              </div>
            </div>

            <div className="preview">
              <span className="preview-label">ตัวอย่างบนจอผู้เล่น</span>
              <span className="preview-q">{sel.text}</span>
              <div className="preview-opts">
                <span>A · {sel.a}</span>
                <span>B · {sel.b}</span>
              </div>
            </div>

            <div className="toolbar">
              <button type="button" className="btn btn-sm btn-outline" onClick={() => create(sel)}>
                ทำสำเนา
              </button>
              <div className="spacer" />
              <button type="button" className="btn btn-sm btn-ghost-danger" onClick={remove}>
                ลบคำถาม
              </button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
