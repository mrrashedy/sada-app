import { Sound } from '../../lib/sounds';

const HeartIcon = ({ filled }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </svg>
);

const CommentIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
  </svg>
);

const InsightIcon = ({ filled }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
    <path d="M9 18h6M10 22h4M12 2a7 7 0 015 11.9V17H7v-3.1A7 7 0 0112 2z"/>
  </svg>
);

const ImportantIcon = ({ filled }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
    <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
  </svg>
);

export function ReactionBar({ articleId, counts = {}, userReactions: rawUR, onToggle, commentCount = 0, onComment, compact = false }) {
  const userReactions = rawUR instanceof Set ? rawUR : new Set();
  const total = (counts.like || 0) + (counts.insightful || 0) + (counts.important || 0);

  const handleReaction = (type) => {
    Sound.tap();
    onToggle?.(articleId, type);
  };

  if (compact) {
    const liked = userReactions.has('like');
    return (
      <div className="reaction-bar compact">
        <button className={`rbtn ${liked ? 'active' : ''}`} onClick={() => handleReaction('like')}>
          <HeartIcon filled={liked} />
          {(counts.like || 0) > 0 && <span className="rbtn-count">{counts.like}</span>}
        </button>
        <button className="rbtn" onClick={onComment}>
          <CommentIcon />
          {commentCount > 0 && <span className="rbtn-count">{commentCount}</span>}
        </button>
      </div>
    );
  }

  const reactions = [
    { type: 'like', Icon: HeartIcon, label: 'إعجاب' },
    { type: 'insightful', Icon: InsightIcon, label: 'مفيد' },
    { type: 'important', Icon: ImportantIcon, label: 'مهم' },
  ];

  return (
    <div className="reaction-bar expanded">
      {reactions.map(r => {
        const active = userReactions.has(r.type);
        const count = counts[r.type] || 0;
        return (
          <button key={r.type} className={`rbtn ${active ? 'active' : ''}`} onClick={() => handleReaction(r.type)}>
            <r.Icon filled={active} />
            <span className="rbtn-label">{r.label}</span>
            {count > 0 && <span className="rbtn-count">{count}</span>}
          </button>
        );
      })}
      <button className="rbtn" onClick={onComment}>
        <CommentIcon />
        <span className="rbtn-label">تعليق</span>
        {commentCount > 0 && <span className="rbtn-count">{commentCount}</span>}
      </button>
    </div>
  );
}
