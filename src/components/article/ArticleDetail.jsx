import { useState, useEffect } from 'react';
import { I } from '../shared/Icons';

export function ArticleDetail({ article, onClose, onSave, isSaved }) {
  const [fullText, setFullText] = useState(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!article.link || article.link === '#') return;
    setFetching(true);
    fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(article.link)}`)
      .then(r => r.json())
      .then(data => {
        const doc = new DOMParser().parseFromString(data.contents || '', 'text/html');
        const selectors = ['article', '.article-body', '.article-content', '.story-body', '.content-body', '.post-content', '.entry-content'];
        let text = '';
        for (const s of selectors) {
          const el = doc.querySelector(s);
          if (el) {
            text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.length > 200) break;
          }
        }
        if (text.length < 200) {
          text = Array.from(doc.querySelectorAll('p'))
            .map(p => p.textContent.trim())
            .filter(t => t.length > 40 && !t.includes('cookie') && !t.match(/https?:\/\//))
            .join('\n\n');
        }
        if (text.length > 100) setFullText(text.slice(0, 4000));
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [article.id]);

  const paragraphs = fullText ? fullText.split('\n').filter(p => p.trim().length > 20) : null;

  return (
    <div className="detail">
      <div className="det-hdr">
        <button className="ib" onClick={onClose}>{I.back()}</button>
        <div style={{ display: 'flex', gap: 14 }}>
          <button className="ib" style={isSaved ? { color: 'var(--bk)' } : {}} onClick={() => onSave(article.id)}>{I.bookmark(isSaved)}</button>
          <button className="ib">{I.share()}</button>
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
      </div>
    </div>
  );
}
