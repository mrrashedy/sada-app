// Editorial item editor — full CRUD for manual_feed_items.
//
// Manual items are inserted into the public /api/feeds response alongside
// RSS-fetched articles. They are editorial content created directly by admins.

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../../lib/adminApi';

const EMPTY = {
  title: '',
  body: '',
  link: '',
  image: '',
  source_name: 'تحرير',
  source_initial: 'ت',
  category: '',
  is_breaking: false,
  pinned: true,
};

export function ManualFeedEditor() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listItems();
      setItems(data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
    setShowForm(false);
  };

  const startCreate = () => {
    setForm(EMPTY);
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (item) => {
    setForm({
      title: item.title || '',
      body: item.body || '',
      link: item.link || '',
      image: item.image || '',
      source_name: item.source_name || 'تحرير',
      source_initial: item.source_initial || 'ت',
      category: item.category || '',
      is_breaking: !!item.is_breaking,
      pinned: !!item.pinned,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.title.trim()) {
      setError('العنوان مطلوب');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await adminApi.updateItem(editingId, form);
      } else {
        await adminApi.createItem(form);
      }
      reset();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('حذف هذا العنصر نهائياً؟')) return;
    setBusy(true);
    try {
      await adminApi.deleteItem(id);
      await load();
    } catch (e) {
      setError(`delete: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: 'var(--t4)' }}>
          {items.length} عنصر
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={load} disabled={loading} style={{
            background: 'var(--f1)', color: 'var(--t2)',
            border: '.5px solid var(--g1)', borderRadius: 6,
            padding: '6px 12px', fontSize: 11, fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
          }}>{loading ? '…' : '↻'}</button>
          {!showForm && (
            <button onClick={startCreate} style={{
              background: 'var(--bk)', color: 'var(--bg)',
              border: 'none', borderRadius: 6,
              padding: '6px 14px', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '.3px',
            }}>+ جديد</button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(211,47,47,.1)', color: 'var(--rd)',
          padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12,
        }}>{error}</div>
      )}

      {/* Create / edit form */}
      {showForm && (
        <div style={{
          background: 'var(--f1)', border: '.5px solid var(--g1)',
          borderRadius: 10, padding: 14, marginBottom: 12,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--t3)',
            letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 10,
            fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
          }}>{editingId ? 'تعديل عنصر' : 'عنصر جديد'}</div>

          <Input label="العنوان *" value={form.title} onChange={v => setForm({ ...form, title: v })} required />
          <Textarea label="النص" value={form.body} onChange={v => setForm({ ...form, body: v })} rows={4} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Input label="الرابط" value={form.link} onChange={v => setForm({ ...form, link: v })} />
            <Input label="الصورة" value={form.image} onChange={v => setForm({ ...form, image: v })} />
            <Input label="اسم المصدر" value={form.source_name} onChange={v => setForm({ ...form, source_name: v })} />
            <Input label="رمز المصدر" value={form.source_initial} onChange={v => setForm({ ...form, source_initial: v })} maxLength={4} />
            <Input label="التصنيف" value={form.category} onChange={v => setForm({ ...form, category: v })} />
          </div>

          <div style={{ display: 'flex', gap: 16, margin: '10px 0', direction: 'rtl' }}>
            <Toggle label="عاجل" checked={form.is_breaking} onChange={v => setForm({ ...form, is_breaking: v })} />
            <Toggle label="مثبت" checked={form.pinned} onChange={v => setForm({ ...form, pinned: v })} />
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={submit} disabled={busy || !form.title.trim()} style={{
              background: 'var(--bk)', color: 'var(--bg)',
              border: 'none', borderRadius: 6,
              padding: '8px 18px', fontSize: 12, fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy || !form.title.trim() ? 0.5 : 1,
            }}>{busy ? '…' : (editingId ? 'حفظ' : 'إنشاء')}</button>
            <button onClick={reset} disabled={busy} style={{
              background: 'var(--bg)', color: 'var(--t2)',
              border: '.5px solid var(--g1)', borderRadius: 6,
              padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>إلغاء</button>
          </div>
        </div>
      )}

      {/* List */}
      {items.map(item => {
        const expired = item.expires_at && new Date(item.expires_at).getTime() < Date.now();
        return (
          <div key={item.id} style={{
            background: 'var(--f1)', border: '.5px solid var(--g1)',
            borderRadius: 10, padding: 12, marginBottom: 8,
            opacity: expired ? 0.5 : 1,
            borderLeft: item.pinned ? '3px solid var(--or)' : item.is_breaking ? '3px solid var(--rd)' : undefined,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 10, color: 'var(--t4)', marginBottom: 6,
              fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
            }}>
              <span>{item.source_name} · {fmtDate(item.created_at)}</span>
              <span>
                {item.is_breaking && <span style={{ color: 'var(--rd)' }}>● عاجل </span>}
                {item.pinned && <span style={{ color: 'var(--or)' }}>📌 </span>}
                {expired && <span style={{ color: 'var(--rd)' }}>منتهي</span>}
              </span>
            </div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--t1)',
              direction: 'rtl', lineHeight: 1.4, marginBottom: 4,
            }}>{item.title}</div>
            {item.body && (
              <div style={{
                fontSize: 12, color: 'var(--t3)', direction: 'rtl', lineHeight: 1.5,
                marginBottom: 8,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>{item.body}</div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <ItemBtn onClick={() => startEdit(item)} disabled={busy}>✎ تحرير</ItemBtn>
              <ItemBtn danger onClick={() => remove(item.id)} disabled={busy}>🗑 حذف</ItemBtn>
            </div>
          </div>
        );
      })}

      {!loading && items.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', color: 'var(--t4)', fontSize: 12, padding: 20 }}>
          لا توجد عناصر — اضغط جديد للإضافة
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, ...props }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{
        fontSize: 10, color: 'var(--t4)', marginBottom: 3,
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
        letterSpacing: '.3px', direction: 'rtl',
      }}>{label}</div>
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        {...props}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--bg)', color: 'var(--t1)',
          border: '.5px solid var(--g1)', borderRadius: 6,
          padding: '8px 10px', fontSize: 13,
          direction: 'rtl', fontFamily: 'inherit',
        }}
      />
    </label>
  );
}

function Textarea({ label, value, onChange, rows = 3 }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{
        fontSize: 10, color: 'var(--t4)', marginBottom: 3,
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
        letterSpacing: '.3px', direction: 'rtl',
      }}>{label}</div>
      <textarea
        value={value} onChange={e => onChange(e.target.value)} rows={rows}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--bg)', color: 'var(--t1)',
          border: '.5px solid var(--g1)', borderRadius: 6,
          padding: '8px 10px', fontSize: 13,
          direction: 'rtl', fontFamily: 'inherit',
          resize: 'vertical', lineHeight: 1.5,
        }}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 6,
      cursor: 'pointer', fontSize: 13, color: 'var(--t1)',
    }}>
      <input
        type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16 }}
      />
      {label}
    </label>
  );
}

function ItemBtn({ danger, children, ...props }) {
  return (
    <button {...props} style={{
      background: danger ? 'rgba(211,47,47,.1)' : 'var(--bg)',
      color: danger ? 'var(--rd)' : 'var(--t2)',
      border: '.5px solid var(--g1)', borderRadius: 6,
      padding: '5px 12px', fontSize: 11, fontWeight: 700,
      cursor: props.disabled ? 'wait' : 'pointer',
      opacity: props.disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
