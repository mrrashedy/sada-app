// Admin operational panel — single screen for launch-day visibility.
//
// Surfaces:
//   - Backend health (KV / Supabase / AI binding) via /api/health?deep=1
//   - Cron worker status (last refresh, alarm armed) via cron-worker /status
//   - Database stats (signups, comments, reactions, bookmarks)
//   - Recent activity feed (latest signups + comments)
//   - Manual actions (force feed refresh)
//
// Auto-refreshes every 15s. Gated by VITE_ADMIN_USER_IDS env var (comma-separated).
// If the var is unset, every signed-in user can see it (with a warning) — handy
// during initial setup, but lock it down before launch.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { NewsMonitor } from './sections/NewsMonitor';
import { RadarTopicsEditor } from './sections/RadarTopicsEditor';
import { ManualFeedEditor } from './sections/ManualFeedEditor';
import { DepthCurate } from '../depth/DepthCurate';

const TABS = [
  { id: 'dashboard', label: 'لوحة' },
  { id: 'news', label: 'الأخبار' },
  { id: 'radar', label: 'الرادار' },
  { id: 'items', label: 'العناصر' },
];

const REFRESH_INTERVAL_MS = 15_000;
const CRON_WORKER_URL = import.meta.env.VITE_CRON_WORKER_URL || '';
const ADMIN_IDS = (import.meta.env.VITE_ADMIN_USER_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isAdmin(user) {
  if (!user) return false;
  if (ADMIN_IDS.length === 0) return true; // open during setup
  return ADMIN_IDS.includes(user.id);
}

// Format helpers
const fmtAge = ms => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
};

const fmtTime = ts => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const fmtDate = ts => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

// Status pill — green/yellow/red based on text
function Pill({ status }) {
  const ok = status === 'ok' || status === 'bound' || status === true;
  const cold = status === 'cold' || status === 'unknown';
  const bg = ok ? 'rgba(46,125,50,.15)' : cold ? 'rgba(255,109,0,.15)' : 'rgba(211,47,47,.15)';
  const fg = ok ? 'var(--gn)' : cold ? 'var(--or)' : 'var(--rd)';
  const label = ok ? (status === 'bound' ? 'BOUND' : 'OK')
    : cold ? String(status).toUpperCase()
    : String(status || 'DOWN').toUpperCase();
  return (
    <span style={{
      background: bg, color: fg,
      padding: '2px 8px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '.5px',
      fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
    }}>{label}</span>
  );
}

function Card({ title, children, action }) {
  return (
    <div style={{
      background: 'var(--f1)', borderRadius: 12,
      padding: 16, marginBottom: 12,
      border: '.5px solid var(--g1)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--t3)',
          letterSpacing: '.8px', textTransform: 'uppercase',
          fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
        }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '.5px solid var(--g1)',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--t3)' }}>{label}</span>
      <span style={{
        color: 'var(--t1)', fontWeight: 600,
        fontFamily: mono ? 'ui-monospace,SFMono-Regular,Menlo,monospace' : 'inherit',
        fontSize: mono ? 12 : 13,
      }}>{value}</span>
    </div>
  );
}

export function AdminPanel({ onClose }) {
  const auth = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [health, setHealth] = useState(null);
  const [healthErr, setHealthErr] = useState(null);
  const [cron, setCron] = useState(null);
  const [cronErr, setCronErr] = useState(null);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState({ comments: [], users: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [refreshFeedStatus, setRefreshFeedStatus] = useState(null);

  const allowed = isAdmin(auth.user);

  // Single fetch round — pulls everything in parallel
  const fetchAll = useCallback(async () => {
    setRefreshing(true);

    // Health
    fetch('/api/health?deep=1')
      .then(r => r.json())
      .then(data => { setHealth(data); setHealthErr(null); })
      .catch(e => { setHealthErr(e.message); setHealth(null); });

    // Cron worker (only if URL configured — separate worker on its own domain)
    if (CRON_WORKER_URL) {
      fetch(`${CRON_WORKER_URL.replace(/\/$/, '')}/status`)
        .then(r => r.json())
        .then(data => { setCron(data); setCronErr(null); })
        .catch(e => { setCronErr(e.message); setCron(null); });
    }

    // DB stats — runs in parallel via Promise.all
    if (supabase) {
      try {
        const [profilesC, commentsC, reactionsC, bookmarksC] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('comments').select('*', { count: 'exact', head: true }),
          supabase.from('reactions').select('*', { count: 'exact', head: true }),
          supabase.from('bookmarks').select('*', { count: 'exact', head: true }),
        ]);
        setStats({
          profiles: profilesC.count,
          comments: commentsC.count,
          reactions: reactionsC.count,
          bookmarks: bookmarksC.count,
        });

        // Recent activity (last 10 of each)
        const [recentComments, recentUsers] = await Promise.all([
          supabase
            .from('comments')
            .select('id, body, created_at, profiles!comments_user_profiles_fk(display_name,username)')
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('profiles')
            .select('id, display_name, username, created_at')
            .order('created_at', { ascending: false })
            .limit(10),
        ]);
        setRecent({
          comments: recentComments.data || [],
          users: recentUsers.data || [],
        });
      } catch (e) {
        console.warn('[admin] db fetch failed:', e.message);
      }
    }

    setLastFetch(Date.now());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    if (tab !== 'dashboard') return; // only auto-poll on dashboard
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [allowed, fetchAll, tab]);

  // Manual feed refresh
  const handleRefreshFeed = async () => {
    setRefreshFeedStatus('running');
    try {
      const res = await fetch('/api/feeds?refresh=1&limit=1');
      setRefreshFeedStatus(res.ok ? 'ok' : `HTTP ${res.status}`);
    } catch (e) {
      setRefreshFeedStatus(`err: ${e.message}`);
    }
    setTimeout(() => setRefreshFeedStatus(null), 3000);
  };

  // ── Access denied ──
  if (!auth.isLoggedIn) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', direction: 'rtl' }}>
        يجب تسجيل الدخول للوصول إلى لوحة التحكم
      </div>
    );
  }
  if (!allowed) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)', direction: 'rtl' }}>
        لا تملك صلاحية الوصول إلى هذه الصفحة
      </div>
    );
  }

  // ── Render ──
  return (
    <div style={{
      direction: 'ltr', // operational panel — LTR is more legible for monitoring
      fontFamily: '-apple-system,system-ui,sans-serif',
      background: 'var(--bg)',
      minHeight: '100%',
      padding: '0 0 40px',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg)',
        borderBottom: '.5px solid var(--g1)',
      }}>
        <div style={{
          padding: '16px 18px 8px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--t1)', fontSize: 20, padding: 4,
          }}>×</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)' }}>Admin</div>
            <div style={{
              fontSize: 10, color: 'var(--t4)',
              fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
            }}>
              {tab === 'dashboard'
                ? (refreshing ? 'refreshing…' : `last sync: ${fmtTime(lastFetch)}`)
                : tab.toUpperCase()}
              {ADMIN_IDS.length === 0 && ' · ⚠ open access'}
            </div>
          </div>
          {tab === 'dashboard' && (
            <button onClick={fetchAll} style={{
              background: 'var(--bk)', color: 'var(--bg)',
              border: 'none', borderRadius: 6,
              padding: '6px 12px', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '.5px',
            }}>REFRESH</button>
          )}
        </div>

        {/* Tab nav */}
        <div style={{
          display: 'flex', gap: 4, padding: '0 14px 8px',
          overflowX: 'auto',
        }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: tab === t.id ? 'var(--bk)' : 'transparent',
              color: tab === t.id ? 'var(--bg)' : 'var(--t3)',
              border: '.5px solid var(--g1)', borderRadius: 6,
              padding: '6px 14px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 14px' }}>

        {tab === 'news' && <NewsMonitor />}
        {tab === 'radar' && <RadarTopicsEditor />}
        {tab === 'items' && <ManualFeedEditor />}

        {tab === 'dashboard' && (<>

        {/* ── Backend health ── */}
        <Card title="Backend Health" action={<Pill status={health?.ok ? 'ok' : (health ? 'down' : 'unknown')} />}>
          {healthErr && <div style={{ color: 'var(--rd)', fontSize: 12, padding: 6 }}>{healthErr}</div>}
          {health && (
            <>
              <Row label="Version" value={health.version || '—'} mono />
              <Row label="Environment" value={health.env || '—'} mono />
              <Row label="KV Cache" value={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pill status={health.services?.kv} />
                  {health.services?.cache_age_ms != null && (
                    <span style={{ fontSize: 11, color: 'var(--t4)' }}>age {fmtAge(health.services.cache_age_ms)}</span>
                  )}
                </span>
              } />
              <Row label="Supabase" value={<Pill status={health.services?.supabase} />} />
              <Row label="Workers AI" value={<Pill status={health.services?.ai} />} />
            </>
          )}
        </Card>

        {/* ── Cron worker ── */}
        <Card title="Cache Refresher (Cron Worker)" action={
          cron ? <Pill status={cron.armed ? 'ok' : 'down'} /> : null
        }>
          {!CRON_WORKER_URL && (
            <div style={{ fontSize: 12, color: 'var(--t4)', padding: 6 }}>
              Set <code style={{ fontFamily: 'monospace', background: 'var(--g1)', padding: '1px 5px', borderRadius: 3 }}>VITE_CRON_WORKER_URL</code> to enable
            </div>
          )}
          {cronErr && <div style={{ color: 'var(--rd)', fontSize: 12, padding: 6 }}>{cronErr}</div>}
          {cron && (
            <>
              <Row label="Alarm Armed" value={cron.armed ? 'yes' : 'no'} mono />
              <Row label="Next In" value={cron.nextIn != null ? fmtAge(cron.nextIn) : '—'} mono />
              <Row label="Last Run" value={fmtTime(cron.lastRun)} mono />
              <Row label="Last Run Ago" value={cron.lastAgo || '—'} mono />
              <Row label="Last Status" value={cron.lastStatus || '—'} mono />
              <Row label="Interval" value={fmtAge(cron.intervalMs)} mono />
            </>
          )}
        </Card>

        {/* ── Database stats ── */}
        <Card title="Database">
          {!stats && <div style={{ fontSize: 12, color: 'var(--t4)' }}>loading…</div>}
          {stats && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 10, marginTop: 4,
            }}>
              <Stat label="Users" value={stats.profiles ?? 0} />
              <Stat label="Comments" value={stats.comments ?? 0} />
              <Stat label="Reactions" value={stats.reactions ?? 0} />
              <Stat label="Bookmarks" value={stats.bookmarks ?? 0} />
            </div>
          )}
        </Card>

        {/* ── Recent users ── */}
        <Card title={`Recent Signups (${recent.users.length})`}>
          {recent.users.length === 0 && <div style={{ fontSize: 12, color: 'var(--t4)' }}>none yet</div>}
          {recent.users.map(u => (
            <div key={u.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '.5px solid var(--g1)',
              fontSize: 12,
            }}>
              <div>
                <div style={{ color: 'var(--t1)', fontWeight: 600 }}>{u.display_name || 'مستخدم'}</div>
                {u.username && <div style={{ color: 'var(--t4)', fontSize: 10 }}>@{u.username}</div>}
              </div>
              <div style={{
                color: 'var(--t4)', fontSize: 10,
                fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
              }}>{fmtDate(u.created_at)}</div>
            </div>
          ))}
        </Card>

        {/* ── Recent comments ── */}
        <Card title={`Recent Comments (${recent.comments.length})`}>
          {recent.comments.length === 0 && <div style={{ fontSize: 12, color: 'var(--t4)' }}>none yet</div>}
          {recent.comments.map(c => (
            <div key={c.id} style={{
              padding: '10px 0', borderBottom: '.5px solid var(--g1)',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, marginBottom: 4,
              }}>
                <span style={{ color: 'var(--t2)', fontWeight: 600 }}>
                  {c.profiles?.display_name || 'مستخدم'}
                </span>
                <span style={{
                  color: 'var(--t4)',
                  fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
                }}>{fmtDate(c.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t1)', lineHeight: 1.5, direction: 'rtl' }}>
                {c.body}
              </div>
            </div>
          ))}
        </Card>

        {/* ── Manual actions ── */}
        <Card title="Actions">
          <button onClick={handleRefreshFeed} disabled={refreshFeedStatus === 'running'} style={{
            width: '100%',
            background: 'var(--bk)', color: 'var(--bg)',
            border: 'none', borderRadius: 8,
            padding: '12px', fontSize: 12, fontWeight: 700,
            cursor: refreshFeedStatus === 'running' ? 'wait' : 'pointer',
            letterSpacing: '.5px',
            opacity: refreshFeedStatus === 'running' ? 0.6 : 1,
          }}>
            {refreshFeedStatus === 'running' ? 'REFRESHING…' :
             refreshFeedStatus === 'ok' ? '✓ DONE' :
             refreshFeedStatus ? `FAILED: ${refreshFeedStatus}` :
             'FORCE FEED REFRESH'}
          </button>
          <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 8, lineHeight: 1.5 }}>
            Triggers /api/feeds?refresh=1 — bypasses KV cache and re-aggregates RSS sources.
          </div>
        </Card>

        </>)}

      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 8,
      padding: '12px 14px',
      border: '.5px solid var(--g1)',
    }}>
      <div style={{
        fontSize: 22, fontWeight: 800, color: 'var(--t1)',
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
      }}>{value.toLocaleString()}</div>
      <div style={{
        fontSize: 10, color: 'var(--t4)',
        textTransform: 'uppercase', letterSpacing: '.5px',
        marginTop: 2,
      }}>{label}</div>
    </div>
  );
}
