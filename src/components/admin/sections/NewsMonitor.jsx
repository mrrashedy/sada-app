// Live feed monitor — lists incoming articles with hide/pin/feature/edit controls.
//
// Loads from /api/admin/articles, which returns the cached feed (top 200) merged
// with any existing article_overrides. Mutations call POST/DELETE on the same
// endpoint and refresh in place.

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../../lib/adminApi';

const FILTERS = [
  { id: 'all', label: 'الكل' },
  { id: 'hidden', label: 'مخفي' },
  { id: 'pinned', label: 'مثبت' },
  { id: 'featured', label: 'مميز' },
  { id: 'breaking', label: 'عاجل' },
];

export function NewsMonitor() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listArticles();
      setItems(data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Patch one item locally (avoids waiting for full reload)
  const patchLocal = (id, patch) => setItems(prev => prev.map(it => (
    it.id === id ? { ...it, override: { ...(it.override || {}), ...patch } } : it
  )));

  const toggle = async (item, key) => {
    setBusyId(item.id);
    const current = item.override?.[key] || false;
    try {
      await adminApi.setArticleOverride({
        article_id: item.id,
        link: item.link,
        hidden: key === 'hidden' ? !current : (item.override?.hidden || false),
        pinned: key === 'pinned' ? !current : (item.override?.pinned || false),
        featured: key === 'featured' ? !current : (item.override?.featured || false),
        custom_title: item.override?.custom_title || null,
        custom_body: item.override?.custom_body || null,
      });
      patchLocal(item.id, { [key]: !current });
    } catch (e) {
      setError(`${key}: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const clearOverride = async (item) => {
    if (!item.override) return;
    setBusyId(item.id);
    try {
      await adminApi.clearArticleOverride(item.id);
      patchLocal(item.id, { hidden: false, pinned: false, featured: false, custom_title: null, custom_body: null });
      // Set override to null after clearing
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, override: null } : it));
    } catch (e) {
      setError(`clear: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditTitle(item.override?.custom_title || item.title || '');
    setEditBody(item.override?.custom_body || item.body || '');
  };

  const saveEdit = async (item) => {
    setBusyId(item.id);
    try {
      const customTitle = editTitle !== item.title ? editTitle : null;
      const customBody = editBody !== item.body ? editBody : null;
      await adminApi.setArticleOverride({
        article_id: item.id,
        link: item.link,
        hidden: item.override?.hidden || false,
        pinned: item.override?.pinned || false,
        featured: item.override?.featured || false,
        custom_title: customTitle,
        custom_body: customBody,
      });
      patchLocal(item.id, { custom_title: customTitle, custom_body: customBody });
      setEditingId(null);
    } catch (e) {
      setError(`save: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  // Filter pipeline
  const visible = items.filter(it => {
    if (filter === 'hidden' && !it.override?.hidden) return false;
    if (filter === 'pinned' && !it.override?.pinned) return false;
    if (filter === 'featured' && !it.override?.featured) return false;
    if (filter === 'breaking' && !it.isBreaking) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(it.title || '').toLowerCase().includes(s) &&
          !(it.source?.name || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            background: filter === f.id ? 'var(--bk)' : 'var(--f1)',
            color: filter === f.id ? 'var(--bg)' : 'var(--t2)',
            border: '.5px solid var(--g1)',
            borderRadius: 6,
            padding: '6px 12px', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '.3px',
          }}>{f.label}</button>
        ))}
        <button onClick={load} disabled={loading} style={{
          marginInlineStart: 'auto',
          background: 'var(--f1)', color: 'var(--t2)',
          border: '.5px solid var(--g1)', borderRadius: 6,
          padding: '6px 12px', fontSize: 11, fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
        }}>{loading ? '…' : '↻'}</button>
      </div>

      <input
        type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="بحث عن عنوان أو مصدر…"
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--f1)', color: 'var(--t1)',
          border: '.5px solid var(--g1)', borderRadius: 8,
          padding: '10px 12px', fontSize: 13, marginBottom: 12,
          direction: 'rtl', fontFamily: 'inherit',
        }}
      />

      {error && (
        <div style={{
          background: 'rgba(211,47,47,.1)', color: 'var(--rd)',
          padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12,
        }}>{error}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 8 }}>
        {visible.length} / {items.length}
      </div>

      {/* Article list */}
      {visible.map(item => {
        const ov = item.override || {};
        const isHidden = ov.hidden;
        const isPinned = ov.pinned;
        const isFeatured = ov.featured;
        const hasCustom = !!ov.custom_title || !!ov.custom_body;
        const editing = editingId === item.id;
        const busy = busyId === item.id;

        return (
          <div key={item.id} style={{
            background: 'var(--f1)',
            border: '.5px solid var(--g1)',
            borderRadius: 10, padding: 12, marginBottom: 8,
            opacity: isHidden ? 0.5 : 1,
            borderLeft: isPinned ? '3px solid var(--or)' : isFeatured ? '3px solid var(--bl)' : undefined,
          }}>
            {/* Source line */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 10, color: 'var(--t4)', marginBottom: 6,
              fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
            }}>
              <span>{item.source?.name || '—'} · {item.time || '—'}</span>
              <span>
                {item.isBreaking && <span style={{ color: 'var(--rd)', marginInlineStart: 6 }}>● عاجل</span>}
                {isPinned && <span style={{ color: 'var(--or)', marginInlineStart: 6 }}>📌</span>}
                {isFeatured && <span style={{ color: 'var(--bl)', marginInlineStart: 6 }}>⭐</span>}
                {isHidden && <span style={{ color: 'var(--rd)', marginInlineStart: 6 }}>🚫</span>}
                {hasCustom && <span style={{ color: 'var(--gn)', marginInlineStart: 6 }}>✎</span>}
              </span>
            </div>

            {/* Title / body — editable */}
            {editing ? (
              <div style={{ direction: 'rtl' }}>
                <input
                  type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--bg)', color: 'var(--t1)',
                    border: '.5px solid var(--g1)', borderRadius: 6,
                    padding: '8px 10px', fontSize: 13, marginBottom: 6,
                    fontWeight: 700, fontFamily: 'inherit',
                  }}
                />
                <textarea
                  value={editBody} onChange={e => setEditBody(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--bg)', color: 'var(--t2)',
                    border: '.5px solid var(--g1)', borderRadius: 6,
                    padding: '8px 10px', fontSize: 12, marginBottom: 6,
                    resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => saveEdit(item)} disabled={busy} style={{
                    background: 'var(--bk)', color: 'var(--bg)',
                    border: 'none', borderRadius: 6,
                    padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}>حفظ</button>
                  <button onClick={() => setEditingId(null)} disabled={busy} style={{
                    background: 'var(--f1)', color: 'var(--t2)',
                    border: '.5px solid var(--g1)', borderRadius: 6,
                    padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}>إلغاء</button>
                </div>
              </div>
            ) : (
              <div style={{ direction: 'rtl' }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: 'var(--t1)',
                  lineHeight: 1.4, marginBottom: 4,
                }}>
                  {ov.custom_title || item.title}
                </div>
                {(ov.custom_body || item.body) && (
                  <div style={{
                    fontSize: 12, color: 'var(--t3)', lineHeight: 1.5,
                    marginBottom: 8,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {ov.custom_body || item.body}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {!editing && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <ActionBtn active={isPinned} onClick={() => toggle(item, 'pinned')} disabled={busy}>📌 تثبيت</ActionBtn>
                <ActionBtn active={isFeatured} onClick={() => toggle(item, 'featured')} disabled={busy}>⭐ مميز</ActionBtn>
                <ActionBtn active={isHidden} danger onClick={() => toggle(item, 'hidden')} disabled={busy}>🚫 إخفاء</ActionBtn>
                <ActionBtn onClick={() => startEdit(item)} disabled={busy}>✎ تحرير</ActionBtn>
                {item.override && (
                  <ActionBtn onClick={() => clearOverride(item)} disabled={busy}>↺ إعادة</ActionBtn>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && visible.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--t4)', fontSize: 12, padding: 20 }}>
          لا توجد نتائج
        </div>
      )}
    </div>
  );
}

function ActionBtn({ active, danger, children, ...props }) {
  return (
    <button {...props} style={{
      background: active ? (danger ? 'var(--rd)' : 'var(--bk)') : 'var(--bg)',
      color: active ? 'var(--bg)' : 'var(--t2)',
      border: '.5px solid var(--g1)',
      borderRadius: 6,
      padding: '5px 10px', fontSize: 11, fontWeight: 700,
      cursor: props.disabled ? 'wait' : 'pointer',
      opacity: props.disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}
