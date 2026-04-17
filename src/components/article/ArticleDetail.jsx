import { useMemo, useState } from 'react';
import { I } from '../shared/Icons';
import { shareArticle } from '../../lib/shareCard';
import { Sound } from '../../lib/sounds';
import { ReactionBar } from '../social/ReactionBar';
import { useHighlight } from '../../hooks/useHighlight';
import { countryName } from '../../lib/countryFlags';

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

// Arabic month names for full-date formatting
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function fmtFullDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = AR_MONTHS[d.getMonth()];
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const mer = h >= 12 ? 'م' : 'ص';
  h = h % 12 || 12;
  return `${day} ${month} • ${h}:${m}${mer}`;
}
// Arabic reading-time — ~200 wpm for Arabic prose.
function fmtReadingTime(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  if (words < 10) return '';
  const mins = Math.max(1, Math.round(words / 200));
  if (mins === 1) return 'قراءة دقيقة';
  if (mins === 2) return 'قراءة دقيقتين';
  if (mins <= 10) return `قراءة ${mins} دقائق`;
  return `قراءة ${mins} دقيقة`;
}

export function ArticleDetail({ article, onClose, onSave, isSaved, reactionCounts, userReactions, onToggleReaction, commentCount, onComment, onOpenRelated, relatedArticles = [], onOpenRadar }) {
  // The article body comes from the RSS <description> field (up to 800 chars),
  // truncated to ~400 chars at a sentence boundary in App.jsx. No proxy
  // scraping — we use only what the publisher gave us in their RSS feed.
  const cleanBody = article.body || '';
  const fullDate = fmtFullDate(article.pubTs || article.timestamp);
  const readingTime = fmtReadingTime(`${article.title || ''} ${cleanBody}`);
  const [linkCopied, setLinkCopied] = useState(false);
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(article.link || window.location.href);
      Sound.tap();
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    } catch {}
  };

  // RSS categories — dedupe, strip the primary tag (already shown as a ptag),
  // drop any very short or junk strings, cap to 5 pills.
  const categories = useMemo(() => {
    const raw = article.categories || [];
    const seen = new Set();
    const primary = (article.tag || '').trim();
    return raw
      .map(c => (typeof c === 'string' ? c.trim() : ''))
      .filter(c => c && c.length >= 2 && c.length <= 32 && c !== primary)
      .filter(c => { const k = c.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 5);
  }, [article.categories, article.tag]);

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

  // More from the SAME source on the SAME topic — narrower than `related`:
  // only items where both outlet and tag match this article's. Falls back to
  // empty (section hides) when the source hasn't covered the topic more than
  // once in the current pool.
  const moreFromSource = useMemo(() => {
    if (!relatedArticles.length) return [];
    const sid = article.s?.id;
    const tag = article.tag;
    if (!sid || !tag) return [];
    return relatedArticles
      .filter(a => a.id !== article.id && a.s?.id === sid && a.tag === tag)
      .slice(0, 4);
  }, [article.id, article.s?.id, article.tag, relatedArticles]);

  return (
    <div className="detail">
      <div className="det-hdr">
        <button className="ib" onClick={onClose}>{I.back()}</button>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button
            className="ib"
            aria-label="نسخ الرابط"
            title={linkCopied ? 'تم النسخ' : 'نسخ الرابط'}
            style={linkCopied ? { color: 'var(--or)' } : {}}
            onClick={handleCopyLink}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>
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
          {(article.s.logo || article.s.domain) && (
            <img
              className="det-src-logo"
              src={article.s.logo || `https://www.google.com/s2/favicons?domain=${article.s.domain}&sz=64`}
              alt=""
              loading="lazy"
              onError={e => { e.currentTarget.remove(); }}
            />
          )}
          <span className="det-src">{article.s.n}</span>
          {article.flags && article.flags.length > 0 && (
            <span className="pdateline" style={{ margin: '0 4px' }}>
              {article.flags.map(c => (
                <span key={c} className="pdateline-item">{countryName(c)}</span>
              ))}
            </span>
          )}
          {article.tag && <div className={`ptag ${article.brk ? 'brk' : ''}`} style={{ margin: 0 }}>{article.tag}</div>}
        </div>
        {/* Meta row: relative time • full date • reading time.
            All three joined by hair-line mid-dots in det-meta CSS. */}
        <div className="det-meta">
          <span>{article.t}</span>
          {fullDate && <><span className="det-meta-dot">•</span><span>{fullDate}</span></>}
          {readingTime && <><span className="det-meta-dot">•</span><span>{readingTime}</span></>}
        </div>
        {article.author && (
          <div className="det-author">بقلم: {article.author}</div>
        )}
        <div className="det-title" dir="auto">{article.title}</div>
        {/* Radar chip — flags this as a story currently tracked on the radar
            and offers a one-tap jump to the radar view filtered to this tag. */}
        {article.tag && onOpenRadar && (
          <button
            type="button"
            className="det-radar-chip"
            onClick={() => { Sound.tap(); onOpenRadar(article.tag); }}
          >
            <span className="det-radar-dot" />
            هذا الخبر على الرادار — افتح الرادار
          </button>
        )}

        {cleanBody && <div className="det-sub" dir="auto">{highlightText(cleanBody, highlightPhrases)}</div>}

        {/* RSS categories — auxiliary tags beyond the primary .tag shown above.
            Hidden when the outlet doesn't ship category data or they're all dupes. */}
        {categories.length > 0 && (
          <div className="det-cats">
            {categories.map(c => (
              <span key={c} className="det-cat">#{c}</span>
            ))}
          </div>
        )}

        {/* Prominent CTA — drives traffic to the source outlet */}
        {article.link && article.link !== '#' && (
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="det-cta">
            إلى {article.s.n} ←
          </a>
        )}

        {/* Reactions + Comments */}
        <div style={{ marginTop: 24 }}>
          <ReactionBar articleId={article.id} counts={reactionCounts} userReactions={userReactions} onToggle={onToggleReaction} commentCount={commentCount || 0} onComment={() => onComment?.(article)} />
        </div>

        {/* More from the same source on the same topic */}
        {moreFromSource.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '.5px solid var(--g1)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t3)', marginBottom: 12, letterSpacing: '.5px' }}>
              المزيد من {article.s.n} عن {article.tag}
            </div>
            {moreFromSource.map(r => (
              <div key={r.id} onClick={() => { Sound.open(); onOpenRelated?.(r); }} style={{ padding: '10px 0', borderBottom: '.5px solid var(--g1)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--t4)' }}>{r.t}</span>
                </div>
                <div dir="auto" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.6, color: 'var(--t1)' }}>{r.title}</div>
              </div>
            ))}
          </div>
        )}

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
