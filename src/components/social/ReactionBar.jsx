import { Sound } from '../../lib/sounds';

// X/Twitter-style icons — thin, geometric, minimal
const HeartIcon = ({ filled }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
);

const CommentIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M1.751 10c0-4.42 3.58-8 8-8h4.5c4.42 0 8 3.58 8 8s-3.58 8-8 8h-1.5l-4.5 4v-4h-.5c-4.42 0-6-3.58-6-8z"/>
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
