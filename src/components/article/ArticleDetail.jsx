import { useState, useEffect, useMemo } from 'react';
import { I } from '../shared/Icons';
import { shareArticle } from '../../lib/shareCard';
import { Sound } from '../../lib/sounds';
import { useSummary } from '../../hooks/useSummary';
import { ReactionBar } from '../social/ReactionBar';

const PROXIES = [
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const SELECTORS = [
  'article', '.article-body', '.article-content', '.article__body',
  '.story-body', '.content-body', '.post-content', '.entry-content',
  '[itemprop="articleBody"]', '.wysiwyg', '.article-text', '.body-content',
  '.article_body', '.td-post-content', '.c-article-body', '.article-detail',
  '.main-article', '.news-article', '.single-post-content',
];

async function fetchFullText(link) {
  for (const makeUrl of PROXIES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(makeUrl(link), { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;

      const data = await res.json().catch(() => null);
      const html = data?.contents || data || '';
      if (typeof html !== 'string' || html.length < 200) continue;

      const doc = new DOMParser().parseFromString(html, 'text/html');

      // Try structured selectors first
      for (const sel of SELECTORS) {
        const el = doc.querySelector(sel);
        if (el) {
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          if (text.length > 200) return text.slice(0, 5000);
        }
      }

      // Fallback: collect all paragraphs
      const paras = Array.from(doc.querySelectorAll('p'))
        .map(p => p.textContent.trim())
        .filter(t => t.length > 30 && !t.includes('cookie') && !t.includes('©') && !t.match(/https?:\/\//));

      if (paras.length >= 2) return paras.join('\n\n').slice(0, 5000);
    } catch {}
  }
  return null;
}

export function ArticleDetail({ article, onClose, onSave, isSaved, reactionCounts, userReactions, onToggleReaction, commentCount, onComment, relatedArticles = [] }) {
  const [fullText, setFullText] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const { summaries, fetchSummary } = useSummary();
  const summary = summaries[article.id];

  useEffect(() => {
    if (!article.link || article.link === '#') return;
    setFetching(true);
    fetchFullText(article.link)
      .then(text => { if (text) setFullText(text); })
      .finally(() => setFetching(false));
  }, [article.id]);

  const handleSummary = () => {
    setShowSummary(true);
    if (!summary?.text && !summary?.loading) {
      fetchSummary(article.id, article.title, article.body || fullText || '');
    }
  };

  const paragraphs = fullText ? fullText.split('\n').filter(p => p.trim().length > 20) : null;

  // Find related stories by matching tags/keywords
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
          <button className="ib" onClick={()=>{Sound.share();shareArticle(article);}}>{I.share()}</button>
        </div>
      </div>
      {article.realImg && (
        <div className="strap det-strap">
          <img
            src={article.realImg}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'saturate(1.3)' }}
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
        <div className="det-title">{article.title}</div>

        {/* AI Summary */}
        <div style={{ marginBottom: 16 }}>
          {!showSummary ? (
            <button onClick={handleSummary} className="ai-summary-btn">
              ✨ ملخص ذكي
            </button>
          ) : (
            <div className="ai-summary-box">
              <div className="ai-summary-hdr">
                <span>✨ ملخص ذكي</span>
                <button onClick={() => setShowSummary(false)} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--ft)' }}>إخفاء</button>
              </div>
              {summary?.loading && <div style={{ color: 'var(--t4)', fontSize: 13 }}>جاري التلخيص بالذكاء الاصطناعي…</div>}
              {summary?.text && <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--t1)' }}>{summary.text}</div>}
              {summary?.error && <div style={{ fontSize: 13, color: 'var(--t3)' }}>التلخيص غير متاح حالياً</div>}
            </div>
          )}
        </div>

        {article.body && <div className="det-sub">{article.body}</div>}
        {fetching && (
          <div style={{ color: 'var(--t4)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
            جاري تحميل المقال…
          </div>
        )}
        {paragraphs && paragraphs.map((p, i) => <p key={i} className="det-p">{p}</p>)}
        {!fetching && !paragraphs && article.link && article.link !== '#' && (
          <p className="det-p" style={{ color: 'var(--t3)', fontStyle: 'italic' }}>
            لم يتم تحميل نص المقال. اقرأ المقال كاملاً من المصدر أدناه.
          </p>
        )}
        {article.link && article.link !== '#' && (
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '.5px solid var(--g1)' }}>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--t3)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--ft)', textDecoration: 'none' }}
            >
              {I.link()} اقرأ من {article.s.n}
            </a>
          </div>
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
              <div key={r.id} onClick={() => { Sound.open(); onClose(); setTimeout(() => onComment?.__openArticle?.(r), 100); }} style={{ padding: '10px 0', borderBottom: '.5px solid var(--g1)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)' }}>{r.s?.n}</span>
                  <span style={{ fontSize: 10, color: 'var(--t4)' }}>{r.t}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.6, color: 'var(--t1)' }}>{r.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
