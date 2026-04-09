import { useState, useEffect } from 'react';
import { I } from '../shared/Icons';
import { useAuth } from '../../context/AuthContext';
import { getBookmarks } from '../../lib/supabase';

export function BookmarksView({ savedIds, onOpen, allFeed }) {
  const { user } = useAuth();
  const [cloudItems, setCloudItems] = useState([]);

  // For logged-in users, also load bookmarks from cloud (persists beyond feed rotation)
  useEffect(() => {
    if (!user) return;
    getBookmarks(user.id).then(rows => {
      const items = rows
        .filter(r => r.article_data)
        .map(r => ({ ...r.article_data, _cloudBookmark: true }));
      setCloudItems(items);
    }).catch(() => {});
  }, [user, savedIds.size]);

  // Merge: feed items matching savedIds + cloud items not in current feed
  const feedSaved = allFeed.filter(f => savedIds.has(f.id));
  const feedIds = new Set(feedSaved.map(f => f.id));
  const extraCloud = cloudItems.filter(c => c.id && !feedIds.has(c.id) && savedIds.has(c.id));
  const saved = [...feedSaved, ...extraCloud];

  if (saved.length === 0) return (
    <div className="empty">
      <div style={{ opacity: .3 }}>{I.bookmark(false)}</div>
      <div className="empty-title">لا توجد محفوظات</div>
      <div className="empty-sub">اضغط على أيقونة الحفظ في أي خبر لإضافته هنا</div>
    </div>
  );
  return saved.map((item, i) => (
    <div key={item.id} className="post" style={{ animationDelay: `${i * .05}s`, cursor: 'pointer' }} onClick={() => onOpen(item)}>
      <div className="ph"><div className="pav">{item.s?.i||'؟'}</div><div className="pinfo"><span className="pname">{item.s?.n||'مصدر'}</span><span className="ptime">{item.t||''}</span></div></div>
      {item.tag && <div className={`ptag ${item.brk ? 'brk' : ''}`}>{item.tag}</div>}
      <div className="ptitle">{item.title}</div>
      {item.body && <div className="pbody" style={{ WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.body}</div>}
    </div>
  ));
}
