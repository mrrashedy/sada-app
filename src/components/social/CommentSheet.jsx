import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useComments } from '../../hooks/useComments';
import { Sound } from '../../lib/sounds';
import { I } from '../shared/Icons';

function timeAgo(ts) {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'الآن';
  if (d < 3600000) return `منذ ${Math.floor(d / 60000)} د`;
  if (d < 86400000) return `منذ ${Math.floor(d / 3600000)} س`;
  return `منذ ${Math.floor(d / 86400000)} ي`;
}

export function CommentSheet({ articleId, onClose, onOpenAuth, onCommentAdded, onCommentRemoved }) {
  const { user, profile, isLoggedIn } = useAuth();
  const { comments, loading, loaded, load, add, remove } = useComments(articleId);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    if (!isLoggedIn) { onOpenAuth?.(); return; }
    setSending(true);
    Sound.tap();
    const result = await add(user.id, text.trim(), replyTo?.id || null, profile);
    setText('');
    setReplyTo(null);
    setSending(false);
    if (result) onCommentAdded?.();
    // Scroll to bottom
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 100);
  };

  // Separate top-level and replies
  const topLevel = comments.filter(c => !c.parent_id);
  const repliesMap = {};
  comments.filter(c => c.parent_id).forEach(c => {
    if (!repliesMap[c.parent_id]) repliesMap[c.parent_id] = [];
    repliesMap[c.parent_id].push(c);
  });

  return (
    <div className="comment-sheet">
      {/* Header */}
      <div className="cs-hdr">
        <button className="ib" onClick={() => { Sound.close(); onClose(); }}>{I.close()}</button>
        <span className="cs-title">التعليقات ({comments.length})</span>
        <div style={{ width: 32 }} />
      </div>

      {/* Comments list */}
      <div className="cs-list" ref={listRef}>
        {loading && !loaded && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t4)', fontSize: 13 }}>جاري التحميل…</div>
        )}
        {loaded && comments.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t4)', fontSize: 13 }}>
            كن أول من يعلّق
          </div>
        )}
        {topLevel.map(c => (
          <div key={c.id}>
            <CommentItem
              comment={c}
              isOwn={user?.id === c.user_id}
              onReply={() => { setReplyTo(c); inputRef.current?.focus(); }}
              onDelete={() => { Sound.tap(); remove(c.id); onCommentRemoved?.(); }}
            />
            {(repliesMap[c.id] || []).map(r => (
              <div key={r.id} style={{ paddingRight: 36 }}>
                <CommentItem
                  comment={r}
                  isOwn={user?.id === r.user_id}
                  onDelete={() => { Sound.tap(); remove(r.id); onCommentRemoved?.(); }}
                  isReply
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Reply indicator */}
      {replyTo && (
        <div className="cs-reply-bar">
          <span>رد على {replyTo.profiles?.display_name || 'مستخدم'}</span>
          <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--ft)', fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* Input */}
      <div className="cs-input-bar">
        <div className="cs-avatar">{(profile?.display_name || '?')[0]}</div>
        <input
          ref={inputRef}
          type="text"
          className="cs-input"
          placeholder={isLoggedIn ? 'اكتب تعليقاً...' : 'سجّل الدخول للتعليق'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          onFocus={() => { if (!isLoggedIn) onOpenAuth?.(); }}
          maxLength={2000}
        />
        <button
          className="cs-send"
          onClick={handleSend}
          disabled={!text.trim() || sending}
        >
          ارسل
        </button>
      </div>
    </div>
  );
}

function CommentItem({ comment, isOwn, onReply, onDelete, isReply }) {
  const p = comment.profiles || {};
  return (
    <div className={`cs-comment ${comment._optimistic ? 'optimistic' : ''}`}>
      <div className="cs-c-avatar">{(p.display_name || '؟')[0]}</div>
      <div className="cs-c-body">
        <div className="cs-c-meta">
          <span className="cs-c-name">{p.display_name || 'مستخدم'}</span>
          {p.username && <span className="cs-c-user">@{p.username}</span>}
          <span className="cs-c-time">{timeAgo(comment.created_at)}</span>
        </div>
        <div className="cs-c-text">{comment.body}</div>
        <div className="cs-c-actions">
          {!isReply && onReply && <button onClick={onReply}>رد</button>}
          {isOwn && <button onClick={onDelete} style={{ color: 'var(--rd)' }}>حذف</button>}
        </div>
      </div>
    </div>
  );
}
