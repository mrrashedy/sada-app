// Radar topic curation — pin / hide / add custom topics that show up on the trending radar.
//
// GET /api/admin/topics returns the live trending list (annotated with override
// state) plus all currently-active overrides. Mutations are POST/DELETE.

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../../../lib/adminApi';

export function RadarTopicsEditor() {
  const [trending, setTrending] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [newWord, setNewWord] = useState('');
  const [newWeight, setNewWeight] = useState(8);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listTopics();
      setTrending(data.trending || []);
      setOverrides(data.overrides || []);
      setCounts(data.counts || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (word, action) => {
    const key = `${word}|${action}`;
    setBusyKey(key);
    setError(null);
    try {
      // Find existing override
      const existing = overrides.find(o => o.word === word && o.action === action);
      if (existing) {
        await adminApi.deleteTopicByWord(word, action);
      } else {
        await adminApi.upsertTopic({ word, action, weight: 5 });
      }
      await load();
    } catch (e) {
      setError(`${action} ${word}: ${e.message}`);
    } finally {
      setBusyKey(null);
    }
  };

  const addCustom = async () => {
    const w = newWord.trim();
    if (!w) return;
    setBusyKey(`add|${w}`);
    setError(null);
    try {
      await adminApi.upsertTopic({ word: w, action: 'add', weight: Number(newWeight) || 5 });
      setNewWord('');
      setNewWeight(8);
      await load();
    } catch (e) {
      setError(`add: ${e.message}`);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      {/* Counts */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        marginBottom: 12,
      }}>
        <Stat label="LIVE" value={counts.live ?? '—'} />
        <Stat label="PINNED" value={counts.pinned ?? '—'} color="var(--or)" />
        <Stat label="HIDDEN" value={counts.hidden ?? '—'} color="var(--rd)" />
        <Stat label="MANUAL" value={counts.added ?? '—'} color="var(--bl)" />
      </div>

      {error && (
        <div style={{
          background: 'rgba(211,47,47,.1)', color: 'var(--rd)',
          padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12,
        }}>{error}</div>
      )}

      {/* Add custom topic */}
      <div style={{
        background: 'var(--f1)', border: '.5px solid var(--g1)',
        borderRadius: 10, padding: 12, marginBottom: 12,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--t3)',
          letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 8,
          fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
        }}>إضافة موضوع يدوي</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text" value={newWord} onChange={e => setNewWord(e.target.value)}
            placeholder="مثلاً: غزة"
            onKeyDown={e => e.key === 'Enter' && addCustom()}
            style={{
              flex: 1, background: 'var(--bg)', color: 'var(--t1)',
              border: '.5px solid var(--g1)', borderRadius: 6,
              padding: '8px 10px', fontSize: 13,
              direction: 'rtl', fontFamily: 'inherit',
            }}
          />
          <input
            type="number" value={newWeight} min="1" max="50"
            onChange={e => setNewWeight(e.target.value)}
            style={{
              width: 60, background: 'var(--bg)', color: 'var(--t1)',
              border: '.5px solid var(--g1)', borderRadius: 6,
              padding: '8px 10px', fontSize: 13, textAlign: 'center',
              fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
            }}
          />
          <button onClick={addCustom} disabled={!newWord.trim() || busyKey?.startsWith('add|')} style={{
            background: 'var(--bk)', color: 'var(--bg)',
            border: 'none', borderRadius: 6,
            padding: '8px 16px', fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
          }}>+</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--t4)' }}>
          {trending.length} مواضيع
        </div>
        <button onClick={load} disabled={loading} style={{
          background: 'var(--f1)', color: 'var(--t2)',
          border: '.5px solid var(--g1)', borderRadius: 6,
          padding: '6px 12px', fontSize: 11, fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
        }}>{loading ? '…' : '↻'}</button>
      </div>

      {/* Topic list */}
      {trending.map((t, i) => {
        const pinKey = `${t.word}|pin`;
        const hideKey = `${t.word}|hide`;
        return (
          <div key={`${t.word}-${i}`} style={{
            background: 'var(--f1)',
            border: '.5px solid var(--g1)',
            borderRadius: 8, padding: '10px 12px', marginBottom: 6,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            opacity: t.hidden ? 0.5 : 1,
            borderLeft: t.pinned ? '3px solid var(--or)' : t.manual ? '3px solid var(--bl)' : undefined,
          }}>
            <div style={{ direction: 'rtl', flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 700, color: 'var(--t1)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{t.word}</div>
              <div style={{
                fontSize: 10, color: 'var(--t4)',
                fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
              }}>
                {t.count}× {t.pinned && '· مثبت'} {t.hidden && '· مخفي'} {t.manual && '· يدوي'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <PillBtn active={t.pinned} onClick={() => toggle(t.word, 'pin')} disabled={busyKey === pinKey}>📌</PillBtn>
              <PillBtn active={t.hidden} danger onClick={() => toggle(t.word, 'hide')} disabled={busyKey === hideKey}>🚫</PillBtn>
            </div>
          </div>
        );
      })}

      {!loading && trending.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--t4)', fontSize: 12, padding: 20 }}>
          لا توجد مواضيع — أعد تحميل الخلاصة
        </div>
      )}
    </div>
  );
}

function PillBtn({ active, danger, children, ...props }) {
  return (
    <button {...props} style={{
      background: active ? (danger ? 'var(--rd)' : 'var(--or)') : 'var(--bg)',
      color: active ? 'var(--bg)' : 'var(--t2)',
      border: '.5px solid var(--g1)',
      borderRadius: 6,
      width: 32, height: 32, fontSize: 13,
      cursor: props.disabled ? 'wait' : 'pointer',
      opacity: props.disabled ? 0.6 : 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--f1)', border: '.5px solid var(--g1)',
      borderRadius: 8, padding: '10px 8px', textAlign: 'center',
    }}>
      <div style={{
        fontSize: 18, fontWeight: 800,
        color: color || 'var(--t1)',
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
      }}>{value}</div>
      <div style={{
        fontSize: 9, color: 'var(--t4)',
        textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 2,
      }}>{label}</div>
    </div>
  );
}
