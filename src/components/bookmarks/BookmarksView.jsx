import { I } from '../shared/Icons';

export function BookmarksView({ savedIds, onOpen, allFeed }) {
  const saved = allFeed.filter(f => savedIds.has(f.id));
  if (saved.length === 0) return (
    <div className="empty">
      <div style={{ opacity: .3 }}>{I.bookmark(false)}</div>
      <div className="empty-title">لا توجد محفوظات</div>
      <div className="empty-sub">اضغط على أيقونة الحفظ في أي خبر لإضافته هنا</div>
    </div>
  );
  return saved.map((item, i) => (
    <div key={item.id} className="post" style={{ animationDelay: `${i * .05}s`, cursor: 'pointer' }} onClick={() => onOpen(item)}>
      <div className="ph"><div className="pav">{item.s.i}</div><div className="pinfo"><span className="pname">{item.s.n}</span><span className="ptime">{item.t}</span></div></div>
      {item.tag && <div className={`ptag ${item.brk ? 'brk' : ''}`}>{item.tag}</div>}
      <div className="ptitle">{item.title}</div>
      {item.body && <div className="pbody" style={{ WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.body}</div>}
    </div>
  ));
}
