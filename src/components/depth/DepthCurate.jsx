// DepthCurate — admin panel for reviewing and curating depth documents.
//
// Shows all documents grouped by source. Each doc has:
//   ✅ Keep (default — no action needed)
//   ❌ Reject — deletes from Supabase, gone from the feed
//
// The panel lets the operator scan what the scraper pulled in and
// quickly reject junk (student events, protocol news, listing pages)
// without touching code.

import { useState, useEffect, useMemo } from 'react';

const CATEGORY_LABEL = {
  think_tank: 'مركز أبحاث',
  specialized: 'بحث متخصّص',
  university: 'جامعي',
  official: 'مصدر رسمي',
  multilateral: 'منظمة دولية',
  media: 'صحافة تحليلية',
  think_tank_media: 'منبر تحليلي',
  data: 'بيانات ومؤشرات',
  conference: 'مؤتمر',
};

export function DepthCurate({ onClose }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejected, setRejected] = useState(new Set());
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/depth-curate')
      .then(r => r.json())
      .then(data => {
        setDocs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = {};
    for (const d of docs) {
      if (rejected.has(d.id)) continue;
      if (filterCat !== 'all' && d.category !== filterCat) continue;
      if (filterStatus !== 'all' && d.analysis_status !== filterStatus) continue;
      if (search && !(d.title || '').toLowerCase().includes(search.toLowerCase()) &&
          !(d.source_name || '').toLowerCase().includes(search.toLowerCase())) continue;
      const key = d.source_name || 'Unknown';
      if (!map[key]) map[key] = { source: key, category: d.category, priority: d.priority, docs: [] };
      map[key].docs.push(d);
    }
    return Object.values(map).sort((a, b) => a.source.localeCompare(b.source));
  }, [docs, rejected, filterCat, filterStatus, search]);

  const totalVisible = grouped.reduce((s, g) => s + g.docs.length, 0);
  const categories = [...new Set(docs.map(d => d.category).filter(Boolean))].sort();

  const handleReject = async (ids) => {
    setRejected(prev => new Set([...prev, ...ids]));
    try {
      await fetch('/api/depth-curate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', ids }),
      });
    } catch (e) {
      console.error('reject failed:', e);
    }
  };

  const handleRejectSource = (group) => {
    const ids = group.docs.map(d => d.id);
    handleReject(ids);
  };

  if (loading) {
    return (
      <div style={styles.root}>
        <div style={styles.header}>
          <h2 style={styles.title}>تنسيق المحتوى</h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>تنسيق المحتوى — Curate</h2>
        <span style={styles.count}>{totalVisible} docs · {grouped.length} sources</span>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <input
          type="text"
          placeholder="Search title or source..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={styles.search}
        />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={styles.select}>
          <option value="all">All categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={styles.select}>
          <option value="all">All statuses</option>
          <option value="done">Analyzed ✅</option>
          <option value="pending">Pending ⏳</option>
          <option value="error">Error ❌</option>
        </select>
      </div>

      {rejected.size > 0 && (
        <div style={styles.rejectedBanner}>
          🗑 {rejected.size} rejected this session
        </div>
      )}

      {/* Source groups */}
      <div style={styles.list}>
        {grouped.map(group => (
          <div key={group.source} style={styles.group}>
            <div style={styles.groupHeader}>
              <span style={styles.sourceName}>{group.source}</span>
              <span style={styles.catChip}>{CATEGORY_LABEL[group.category] || group.category}</span>
              <span style={styles.docCount}>{group.docs.length}</span>
              <button
                onClick={() => handleRejectSource(group)}
                style={styles.rejectAllBtn}
                title="Reject all from this source"
              >
                ❌ reject all
              </button>
            </div>
            {group.docs.map(doc => (
              <div key={doc.id} style={styles.docRow}>
                <button
                  onClick={() => handleReject([doc.id])}
                  style={styles.rejectBtn}
                  title="Reject"
                >
                  ✕
                </button>
                <div style={styles.docInfo}>
                  <div style={styles.docTitle} dir="auto">
                    {doc.title}
                    {doc.analysis_status === 'done' && (
                      <span style={styles.analyzedDot}>●</span>
                    )}
                  </div>
                  {doc.analytical_conclusion && (
                    <div style={styles.conclusion} dir="auto">
                      {doc.analytical_conclusion}
                    </div>
                  )}
                  <div style={styles.docMeta}>
                    <span>{doc.language || '?'}</span>
                    {doc.published_at && (
                      <span>{new Date(doc.published_at).toLocaleDateString()}</span>
                    )}
                    <a
                      href={doc.canonical_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.link}
                      onClick={e => e.stopPropagation()}
                    >
                      source ↗
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  root: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'var(--bg, #fff)',
    overflow: 'auto',
    fontFamily: '-apple-system, sans-serif',
  },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '16px 20px',
    background: 'var(--bg, #fff)',
    borderBottom: '1px solid var(--g1, #e0e0e0)',
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--bk, #000)' },
  count: { fontSize: 13, color: 'var(--t3, #888)', flex: 1 },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 20,
    cursor: 'pointer', color: 'var(--t2, #666)', padding: '4px 8px',
  },
  filters: {
    display: 'flex', gap: 8, padding: '12px 20px',
    borderBottom: '1px solid var(--g05, #f0f0f0)',
    flexWrap: 'wrap',
  },
  search: {
    flex: 1, minWidth: 200, padding: '8px 12px',
    border: '1px solid var(--g1, #ddd)', borderRadius: 8,
    fontSize: 14, background: 'var(--bg, #fff)', color: 'var(--bk, #000)',
    outline: 'none',
  },
  select: {
    padding: '8px 12px', border: '1px solid var(--g1, #ddd)',
    borderRadius: 8, fontSize: 13, background: 'var(--bg, #fff)',
    color: 'var(--bk, #000)',
  },
  rejectedBanner: {
    padding: '8px 20px', background: '#fef3cd',
    color: '#856404', fontSize: 13, fontWeight: 600,
  },
  loading: { padding: 40, textAlign: 'center', color: 'var(--t3, #888)' },
  list: { padding: '0 0 80px' },
  group: {
    borderBottom: '1px solid var(--g1, #e0e0e0)',
  },
  groupHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 20px',
    background: 'var(--g05, #f8f8f8)',
    position: 'sticky', top: 60, zIndex: 5,
  },
  sourceName: { fontWeight: 700, fontSize: 14, color: 'var(--bk, #000)' },
  catChip: {
    fontSize: 11, padding: '2px 8px', borderRadius: 10,
    background: 'var(--g1, #e0e0e0)', color: 'var(--t2, #666)',
  },
  docCount: {
    fontSize: 12, fontWeight: 700, color: 'var(--t3, #888)',
    marginLeft: 'auto',
  },
  rejectAllBtn: {
    fontSize: 11, padding: '4px 10px', borderRadius: 6,
    background: '#fee', border: '1px solid #fcc', color: '#c33',
    cursor: 'pointer', fontWeight: 600,
  },
  docRow: {
    display: 'flex', gap: 8, padding: '10px 20px',
    borderTop: '1px solid var(--g05, #f0f0f0)',
    alignItems: 'flex-start',
  },
  rejectBtn: {
    flexShrink: 0, width: 28, height: 28, borderRadius: 6,
    background: 'var(--g05, #f5f5f5)', border: '1px solid var(--g1, #ddd)',
    cursor: 'pointer', fontSize: 12, color: '#c33',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  docInfo: { flex: 1, minWidth: 0 },
  docTitle: {
    fontSize: 14, fontWeight: 600, color: 'var(--bk, #000)',
    lineHeight: 1.4,
  },
  analyzedDot: { color: '#4caf50', fontSize: 8, marginLeft: 6 },
  conclusion: {
    fontSize: 12, color: 'var(--t2, #666)', marginTop: 4,
    lineHeight: 1.5, fontStyle: 'italic',
  },
  docMeta: {
    display: 'flex', gap: 12, marginTop: 4,
    fontSize: 11, color: 'var(--t3, #999)',
  },
  link: { color: 'var(--t3, #999)', textDecoration: 'none' },
};
