import { SOURCES } from '../../data/sources';
import { TOPICS, REGIONS } from '../../data/topics';

// Admin allowlist — comma-separated Supabase user IDs in env var.
// Empty list means open access (handy during initial setup).
const ADMIN_IDS = (import.meta.env.VITE_ADMIN_USER_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isAdmin(user) {
  if (!user) return false;
  if (ADMIN_IDS.length === 0) return true;
  return ADMIN_IDS.includes(user.id);
}

// Snapchat-style circular logo chip — tap to toggle a source on/off.
function SourceChip({ source, on, onToggle }) {
  const logo = source.logo || (source.domain ? `https://www.google.com/s2/favicons?domain=${source.domain}&sz=128` : null);
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 6, padding: '6px 4px', background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: 'var(--ft)',
        opacity: on ? 1 : 0.38,
        transition: 'opacity .2s, transform .15s',
      }}
      onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.94)')}
      onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div
        style={{
          width: 58, height: 58, borderRadius: '50%',
          background: on ? 'var(--bk)' : 'var(--g1)',
          border: on ? '2.5px solid var(--bk)' : '2px solid var(--g1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
          boxShadow: on ? '0 4px 14px rgba(0,0,0,.18)' : 'none',
          transition: 'all .2s',
        }}
      >
        {logo ? (
          <img
            src={logo}
            alt=""
            loading="lazy"
            onError={e => { e.currentTarget.style.display = 'none'; }}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              filter: on ? 'none' : 'grayscale(1)',
            }}
          />
        ) : (
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 900 }}>{source.i}</span>
        )}
        {on && (
          <div
            style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--rd)', border: '2.5px solid var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1,
            }}
          >
            ✓
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 10.5, fontWeight: 600, color: 'var(--t2)',
          textAlign: 'center', maxWidth: 82,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.2,
        }}
      >
        {source.n}
      </div>
    </button>
  );
}

// Emoji/flag chip for topics and regions.
function ChoiceChip({ id, label, icon, on, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 14px', borderRadius: 24,
        border: on ? '1.5px solid var(--bk)' : '1px solid var(--g1)',
        background: on ? 'var(--bk)' : 'transparent',
        color: on ? 'var(--bg)' : 'var(--t2)',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'var(--ft)', transition: 'all .15s',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  );
}

export function SettingsView({
  sources, toggleSource, userPrefs = {},
  onUpdatePrefs, onResetPrefs,
  theme, toggleTheme, auth = {},
  onOpenAuth, onOpenProfile, onOpenAdmin,
}) {
  const showAdmin = auth.isLoggedIn && isAdmin(auth.user) && onOpenAdmin;
  const selectedSourcesCount = SOURCES.filter(s => sources[s.id] !== false).length;

  const toggleTopic = (id) => {
    const cur = new Set(userPrefs.topics || []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    onUpdatePrefs({ ...userPrefs, topics: [...cur] });
  };
  const toggleRegion = (id) => {
    const cur = new Set(userPrefs.regions || []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    onUpdatePrefs({ ...userPrefs, regions: [...cur] });
  };

  return (
    <>
      {/* ─── Account ─── */}
      <div className="set-sec">
        <div className="set-sec-title">الحساب</div>
        {auth.isLoggedIn ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--rd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {(auth.profile?.display_name || '?')[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{auth.profile?.display_name || 'مستخدم'}</div>
                {auth.profile?.username && <div style={{ fontSize: 12, color: 'var(--t3)' }}>@{auth.profile.username}</div>}
                <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{auth.user?.email}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onOpenProfile} style={{ flex: 1, background: 'none', border: '1px solid var(--g1)', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 600, color: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--ft)' }}>
                تعديل الملف الشخصي
              </button>
              <button onClick={() => auth.signOut()} style={{ flex: 1, background: 'none', border: '1px solid var(--g1)', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 600, color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--ft)' }}>
                تسجيل الخروج
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.8, marginBottom: 14 }}>
              سجّل الدخول لمزامنة محفوظاتك واهتماماتك عبر أجهزتك
            </div>
            <button onClick={onOpenAuth} style={{ width: '100%', background: 'var(--bk)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--ft)' }}>
              تسجيل الدخول أو إنشاء حساب
            </button>
          </div>
        )}
      </div>

      {/* ─── Sources — interactive icon pool ─── */}
      <div className="set-sec">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="set-sec-title" style={{ marginBottom: 0 }}>مصادرك المفضلة</div>
          <div style={{ fontSize: 11, color: 'var(--t4)', fontVariantNumeric: 'tabular-nums' }}>
            {selectedSourcesCount} / {SOURCES.length}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.7, marginBottom: 18 }}>
          اضغط على أيقونة المصدر لتفعيله أو إيقافه. المصادر الباهتة متوقفة.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))',
            gap: 10,
            rowGap: 16,
          }}
        >
          {SOURCES.map((s) => (
            <SourceChip
              key={s.id}
              source={s}
              on={sources[s.id] !== false}
              onToggle={() => toggleSource(s.id)}
            />
          ))}
        </div>
      </div>

      {/* ─── Topics ─── */}
      <div className="set-sec">
        <div className="set-sec-title">اهتماماتك</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.7, marginBottom: 14 }}>
          اختياراتك تُشكّل تبويب <strong style={{ color: 'var(--t2)' }}>مهم</strong> في تغذيتك.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TOPICS.map(t => (
            <ChoiceChip
              key={t.id}
              id={t.id}
              label={t.label}
              icon={t.icon}
              on={(userPrefs.topics || []).includes(t.id)}
              onToggle={() => toggleTopic(t.id)}
            />
          ))}
        </div>
      </div>

      {/* ─── Regions ─── */}
      <div className="set-sec">
        <div className="set-sec-title">المناطق الجغرافية</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.7, marginBottom: 14 }}>
          نرتّب الأخبار الإقليمية حسب اهتمامك الجغرافي.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {REGIONS.map(r => (
            <ChoiceChip
              key={r.id}
              id={r.id}
              label={r.label}
              icon={r.flag}
              on={(userPrefs.regions || []).includes(r.id)}
              onToggle={() => toggleRegion(r.id)}
            />
          ))}
        </div>
      </div>

      {/* ─── Preferences ─── */}
      <div className="set-sec">
        <div className="set-sec-title">التفضيلات</div>
        <div className="set-row"><span className="set-name">إشعارات الأخبار العاجلة</span><button className="toggle on"/></div>
        <div className="set-row"><span className="set-name">الوضع الداكن</span><button className={`toggle ${theme === 'dark' ? 'on' : ''}`} onClick={toggleTheme}/></div>
        <div className="set-row"><span className="set-name">تشغيل الفيديو تلقائياً</span><button className="toggle"/></div>
      </div>

      {/* ─── Reset ─── */}
      <div className="set-sec">
        <button onClick={onResetPrefs} style={{ background: 'none', border: '1px solid var(--g1)', borderRadius: 24, padding: '10px 20px', fontSize: 13, fontWeight: 600, color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--ft)', width: '100%' }}>
          إعادة ضبط التفضيلات
        </button>
      </div>

      {showAdmin && (
        <div className="set-sec">
          <div className="set-sec-title">المسؤول</div>
          <button onClick={onOpenAdmin} style={{
            width: '100%', background: 'var(--bk)', color: 'var(--bg)',
            border: 'none', borderRadius: 12, padding: '13px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
            letterSpacing: '.5px',
          }}>OPEN ADMIN PANEL</button>
          <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 8, lineHeight: 1.6, textAlign: 'center' }}>
            {ADMIN_IDS.length === 0 ? '⚠ open access — set VITE_ADMIN_USER_IDS to lock' : 'صلاحية مخوّلة'}
          </div>
        </div>
      )}

      <div style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 4 }}>غرفة الأخبار v4.0</div>
        <div style={{ fontSize: 11, color: 'var(--t4)' }}>أخبار العالم في مكانٍ واحد</div>
      </div>
    </>
  );
}
