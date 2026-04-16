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
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);

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
    setScrapeUrl('');
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

  // Paste URL → auto-fill form by hitting /api/admin/scrape-url.
  // Only overwrites a field if the scrape returned something for it, so the
  // editor can pre-fill, then paste, then tweak without losing work.
  const fetchFromUrl = async () => {
    const url = scrapeUrl.trim();
    if (!url) return;
    setScraping(true);
    setError(null);
    try {
      const data = await adminApi.scrapeFromUrl(url);
      setForm(prev => ({
        ...prev,
        title: data.title || prev.title,
        body: data.description || prev.body,
        image: data.image || prev.image,
        link: data.url || url,
        source_name: data.siteName || prev.source_name,
        source_initial: data.siteName
          ? data.siteName.trim().charAt(0)
          : prev.source_initial,
      }));
    } catch (e) {
      setError(`استخراج: ${e.message}`);
    } finally {
      setScraping(false);
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

          {!editingId && (
            <div style={{
              background: 'var(--bg)', border: '.5px dashed var(--g1)',
              borderRadius: 8, padding: 10, marginBottom: 12,
            }}>
              <div style={{
                fontSize: 10, color: 'var(--t4)', marginBottom: 6,
                fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
                letterSpacing: '.3px', direction: 'rtl',
              }}>استخراج من رابط — ألصق رابط المقال</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={e => setScrapeUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  disabled={scraping}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchFromUrl(); } }}
                  style={{
                    flex: 1, boxSizing: 'border-box', minWidth: 0,
                    background: 'var(--bg)', color: 'var(--t1)',
                    border: '.5px solid var(--g1)', borderRadius: 6,
                    padding: '8px 10px', fontSize: 12,
                    direction: 'ltr', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
                  }}
                />
                <button
                  onClick={fetchFromUrl}
                  disabled={scraping || !scrapeUrl.trim()}
                  style={{
                    background: 'var(--bk)', color: 'var(--bg)',
                    border: 'none', borderRadius: 6,
                    padding: '8px 14px', fontSize: 11, fontWeight: 700,
                    cursor: scraping ? 'wait' : 'pointer',
                    opacity: scraping || !scrapeUrl.trim() ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >{scraping ? '…' : 'استخراج'}</button>
              </div>
            </div>
          )}

          <Input label="العنوان *" value={form.title} onChange={v => setForm({ ...form, title: v })} required />
          <Textarea label="النص" value={form.body} onChange={v => setForm({ ...form, body: v })} rows={4} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Input label="الرابط" value={form.link} onChange={v => setForm({ ...form, link: v })} />
            <Input label="الصورة" value={form.image} onChange={v => setForm({ ...form, image: v })} />
            <Input label="اسم المصدر" value={form.source_name} onChange={v => setForm({ ...form, source_name: v })} />
            <Input label="رمز المصدر" value={form.source_initial} onChange={v => setForm({ ...form, source_initial: v })} maxLength={4} />
            <Input label="التصنيف" value={form.category} onChange={v => setForm({ ...form, category: v })} />
          </div>

          <ModeSelector
            mode={form.is_breaking ? 'breaking' : form.pinned ? 'pinned' : 'normal'}
            onChange={m => setForm({
              ...form,
              is_breaking: m === 'breaking',
              pinned: m === 'pinned',
            })}
          />

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

// Three-way mode selector: عاجل (breaking) / مثبت (pinned) / عادي (normal flow).
// The three modes are mutually exclusive and map to the underlying booleans:
//   breaking → { is_breaking: true,  pinned: false } — shows in breaking bar,
//                                                      flows into feed by timestamp
//   pinned   → { is_breaking: false, pinned: true  } — always at top of feed
//   normal   → { is_breaking: false, pinned: false } — flows into feed at its
//                                                      created_at timestamp
function ModeSelector({ mode, onChange }) {
  const options = [
    { value: 'breaking', label: 'عاجل', hint: 'يظهر في شريط العاجل + تسلسل زمني' },
    { value: 'pinned',   label: 'مثبت', hint: 'مثبّت دائماً أعلى الخلاصة' },
    { value: 'normal',   label: 'عادي', hint: 'يظهر في موقعه الزمني الطبيعي' },
  ];
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{
        fontSize: 10, color: 'var(--t4)', marginBottom: 6,
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
        letterSpacing: '.3px', direction: 'rtl',
      }}>النمط</div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
        direction: 'rtl',
      }}>
        {options.map(opt => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              title={opt.hint}
              style={{
                background: active ? 'var(--bk)' : 'var(--bg)',
                color: active ? 'var(--bg)' : 'var(--t2)',
                border: active ? '.5px solid var(--bk)' : '.5px solid var(--g1)',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer', direction: 'rtl',
                fontFamily: 'inherit',
                transition: 'background .12s, color .12s',
              }}
            >{opt.label}</button>
          );
        })}
      </div>
    </div>
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
