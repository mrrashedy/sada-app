import { useState } from 'react';
import { liveTimeAgo } from '../../lib/timeAgo';
import { useTick } from '../../hooks/useTick';
import { useAuth } from '../../context/AuthContext';
import { useActivity } from '../../hooks/useActivity';

function timeAgo(ts) {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'الآن';
  if (d < 3600000) return `منذ ${Math.floor(d / 60000)} د`;
  if (d < 86400000) return `منذ ${Math.floor(d / 3600000)} س`;
  return `منذ ${Math.floor(d / 86400000)} ي`;
}

function actionText(item) {
  switch (item.action_type) {
    case 'reaction': {
      const rt = item.metadata?.reaction_type;
      const labels = { like: 'أعجب', insightful: 'وجد مفيداً', important: 'وجد مهماً' };
      return labels[rt] || 'تفاعل مع';
    }
    case 'comment': return 'علّق على';
    case 'reply': return 'ردّ على تعليقك';
    case 'follow': return 'بدأ متابعتك';
    default: return '';
  }
}

function actionIcon(type) {
  switch (type) {
    case 'reaction': return '♥';
    case 'comment': return '💬';
    case 'reply': return '↩️';
    case 'follow': return '👤';
    default: return '•';
  }
}

export function NotificationPanel({ allFeed, onClose, onOpen }) {
  const { user, isLoggedIn } = useAuth();
  const { items: activity, loading: actLoading, markAllRead } = useActivity(user?.id);
  const [tab, setTab] = useState('news'); // 'news' | 'activity'
  useTick(1000);

  return (
    <div className="srch" style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '.5px solid var(--g1)', paddingBottom: 12, marginBottom: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>التحديثات</span>
        <button className="srch-c" onClick={onClose}>إغلاق</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '.5px solid var(--g1)' }}>
        <button onClick={() => setTab('news')} style={{ flex: 1, padding: '12px', background: 'none', border: 'none', fontSize: 13, fontWeight: tab === 'news' ? 700 : 500, color: tab === 'news' ? 'var(--bk)' : 'var(--t4)', cursor: 'pointer', fontFamily: 'var(--ft)', borderBottom: tab === 'news' ? '2px solid var(--bk)' : '2px solid transparent' }}>
          أخبار جديدة
        </button>
        {isLoggedIn && (
          <button onClick={() => { setTab('activity'); markAllRead(); }} style={{ flex: 1, padding: '12px', background: 'none', border: 'none', fontSize: 13, fontWeight: tab === 'activity' ? 700 : 500, color: tab === 'activity' ? 'var(--bk)' : 'var(--t4)', cursor: 'pointer', fontFamily: 'var(--ft)', borderBottom: tab === 'activity' ? '2px solid var(--bk)' : '2px solid transparent', position: 'relative' }}>
            نشاط
            {activity.filter(a => !a.read).length > 0 && (
              <span style={{ position: 'absolute', top: 8, left: '30%', width: 6, height: 6, borderRadius: '50%', background: 'var(--rd)' }} />
            )}
          </button>
        )}
      </div>

      {/* News tab */}
      {tab === 'news' && (
        <div>
          {allFeed.length === 0 && <div className="empty"><div className="empty-title">لا توجد تحديثات</div></div>}
          {allFeed.slice(0, 30).map((item, i) => (
            <div key={item.id} style={{ padding: '12px 0', borderBottom: '.5px solid var(--g1)', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 12px' }} onClick={() => { onOpen(item); onClose(); }}>
              <div className="pav" style={{ width: 32, height: 32, fontSize: 11, flexShrink: 0, marginTop: 2 }}>{item.s.i}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{item.s.n}</span>
                  <span style={{ fontSize: 11, color: 'var(--t4)' }}>{liveTimeAgo(item.pubTs)}</span>
                  {item.brk && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--rd)', border: '1px solid rgba(183,28,28,.15)', padding: '1px 6px', borderRadius: 3 }}>عاجل</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.6, color: 'var(--t1)' }}>{item.title}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity tab */}
      {tab === 'activity' && isLoggedIn && (
        <div>
          {actLoading && <div style={{ textAlign: 'center', padding: 30, color: 'var(--t4)', fontSize: 13 }}>جاري التحميل…</div>}
          {!actLoading && activity.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--t4)', fontSize: 13 }}>
              لا يوجد نشاط بعد
            </div>
          )}
          {activity.map(item => (
            <div key={item.id} style={{
              padding: '14px 12px', borderBottom: '.5px solid var(--g1)', display: 'flex', gap: 10,
              alignItems: 'flex-start', background: item.read ? 'transparent' : 'rgba(183,28,28,.02)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: 'var(--f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
              }}>
                {actionIcon(item.action_type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--t1)' }}>
                  <strong>{item.actor?.display_name || 'مستخدم'}</strong>{' '}
                  {actionText(item)}
                  {item.action_type === 'reply' && item.metadata?.body_preview && (
                    <span style={{ color: 'var(--t3)' }}> "{item.metadata.body_preview.slice(0, 50)}"</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 3 }}>{timeAgo(item.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
