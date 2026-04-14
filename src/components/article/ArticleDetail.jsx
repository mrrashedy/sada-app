import { useMemo } from 'react';
import { I } from '../shared/Icons';
import { shareArticle } from '../../lib/shareCard';
import { Sound } from '../../lib/sounds';
import { ReactionBar } from '../social/ReactionBar';
import { useHighlight } from '../../hooks/useHighlight';

// Wrap verbatim occurrences of `phrases` inside `text` in <mark class="hl">…</mark>.
function highlightText(text, phrases) {
  if (!text || !phrases?.length) return text;
  const ordered = [...phrases].sort((a, b) => b.length - a.length);
  const escaped = ordered.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'g');
  const parts = text.split(re);
  return parts.map((part, i) =>
    ordered.includes(part)
      ? <mark key={i} className="hl">{part}</mark>
      : part
  );
}

export function ArticleDetail({ article, onClose, onSave, isSaved, reactionCounts, userReactions, onToggleReaction, commentCount, onComment, onOpenRelated, relatedArticles = [] }) {
  // The article body comes from the RSS <description> field (up to 800 chars),
  // truncated to ~400 chars at a sentence boundary in App.jsx. No proxy
  // scraping — we use only what the publisher gave us in their RSS feed.
  const cleanBody = article.body || '';

  // AI-highlighted key phrases from the RSS body
  const { phrases: highlightPhrases } = useHighlight(article.id, article.title, cleanBody);

  // Related stories by tag/keyword overlap
  const related = useMemo(() => {
    if (!relatedArticles.length) return [];
    const keywords = [article.tag, ...(article.tags || [])].filter(Boolean);
    if (!keywords.length) return [];
    return relatedArticles
      .filter(a => a.id !== article.id)
      .filter(a => {
        const aTags = [a.tag, ...(a.tags || [])].filter(Boolean);
        return keywords.some(k => aTags.includes(k)) || (a.title && article.title && a.title.split(' ').filter(w => w.length > 3).some(w => article.title.includes(w)));
      })
      .slice(0, 5);
  }, [article.id, relatedArticles]);

  return (
    <div className="detail">
      <div className="det-hdr">
        <button className="ib" onClick={onClose}>{I.back()}</button>
        <div style={{ display: 'flex', gap: 14 }}>
          <button className="ib" style={isSaved ? { color: 'var(--bk)' } : {}} onClick={() => onSave(article.id)}>{I.bookmark(isSaved)}</button>
          <button className="ib" onClick={() => { Sound.share(); shareArticle(article); }}>{I.share()}</button>
        </div>
      </div>
      {article.realImg && (
        <div className="strap det-strap">
          <img
            src={article.realImg}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { e.target.parentElement.style.display = 'none'; }}
          />
        </div>
      )}
      <div className="det-body">
        <div className="det-tag-row">
          <span className="det-src">{article.s.n}</span>
          {article.tag && <div className={`ptag ${article.brk ? 'brk' : ''}`} style={{ margin: 0 }}>{article.tag}</div>}
        </div>
        <div className="det-meta"><span>{article.t}</span></div>
        <div className="det-title" dir="auto">{article.title}</div>

        {cleanBody && <div className="det-sub" dir="auto">{highlightText(cleanBody, highlightPhrases)}</div>}

        {/* Prominent CTA — drives traffic to the source outlet */}
        {article.link && article.link !== '#' && (
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="det-cta">
            اقرأ المقال كاملاً في {article.s.n} ←
          </a>
        )}

        {/* Reactions + Comments */}
        <div style={{ marginTop: 24 }}>
          <ReactionBar articleId={article.id} counts={reactionCounts} userReactions={userReactions} onToggle={onToggleReaction} commentCount={commentCount || 0} onComment={() => onComment?.(article)} />
        </div>

        {/* Related stories */}
        {related.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '.5px solid var(--g1)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t3)', marginBottom: 12, letterSpacing: '.5px' }}>قصص ذات صلة</div>
            {related.map(r => (
              <div key={r.id} onClick={() => { Sound.open(); onOpenRelated?.(r); }} style={{ padding: '10px 0', borderBottom: '.5px solid var(--g1)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)' }}>{r.s?.n}</span>
                  <span style={{ fontSize: 10, color: 'var(--t4)' }}>{r.t}</span>
                </div>
                <div dir="auto" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.6, color: 'var(--t1)' }}>{r.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
