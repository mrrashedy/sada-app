import { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { I } from '../shared/Icons';
import { useTick } from '../../hooks/useTick';
import { liveTimeAgo } from '../../lib/timeAgo';
import { Sound } from '../../lib/sounds';
import { shareArticle } from '../../lib/shareCard';
import { countryName } from '../../lib/countryFlags';

// All four .act icons inlined locally with identical geometry — same
// All four icons share identical SVG specs and the same minimal stroke
// vocabulary — only straight lines, no curves, no containers. Each icon
// is 1-3 line segments, so the four read as members of the same family.
//
//   + : two crossed lines                 (add to important)
//   − : one horizontal line               (subtract / dismiss)
//   ✱ : three crossed lines (6-point)     (save — asterisk-star, marked)
//   ↗ : diagonal + L-shaped arrowhead     (share — outward direction)
const ICON_PROPS = {
  width: 18, height: 18, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 3,
  strokeLinecap: 'round', strokeLinejoin: 'round',
};
const Plus  = () => <svg {...ICON_PROPS}><path d="M12 5v14M5 12h14"/></svg>;
const Minus = () => <svg {...ICON_PROPS}><path d="M5 12h14"/></svg>;
const Save  = () => (
  // Asterisk — 6-point star drawn as 3 lines crossing at center. All
  // straight lines, identical stroke spec to + and −. Active state
  // carried by .util-btn.on color change (orange), no shape change.
  <svg {...ICON_PROPS}>
    <path d="M12 5v14"/>
    <path d="M6.06 8.5l11.88 7"/>
    <path d="M6.06 15.5l11.88-7"/>
  </svg>
);
const Share = () => (
  // Two strokes only: a diagonal line and an L-shaped arrowhead.
  <svg {...ICON_PROPS}>
    <path d="M7 17L17 7"/>
    <path d="M9 7h8v8"/>
  </svg>
);

const PERSON_RE = /رئيس|وزير|نائب|أمير|ملك|سفير|قائد|أمين|زعيم|قاض|مبعوث|صرّح|صرح|أعلن|أكد|قال|يقول|طالب|دعا|أردوغان|ترامب|بايدن|نتنياهو|بوتين|ماكرون|زيلينسكي|بن سلمان/;

function clean(s) {
  if (!s) return s;
  return s.replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'')
    .replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&nbsp;/g,' ').replace(/&#039;/g,"'").replace(/&apos;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n))
    .replace(/&#x([0-9a-fA-F]+);/g,(_,h)=>String.fromCharCode(parseInt(h,16)))
    .replace(/&[a-z]+;/gi,' ').replace(/<[^>]*>/g,'').trim();
}

// Decide whether the brief is redundant with the title — many RSS feeds
// repeat the headline verbatim (or near-verbatim) in the <description>.
// Hide the brief when one contains the other, or when their normalized
// word sets overlap >=70%.
function isBriefRedundant(title, brief) {
  if (!title || !brief) return false;
  const norm = s => s
    .replace(/<[^>]*>/g, ' ')
    .replace(/[.,،؛؟!:"'«»“”\-–—|(){}\[\]…]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const t = norm(title);
  const b = norm(brief);
  if (!t || !b) return false;
  if (t === b) return true;
  if (b.startsWith(t) || t.startsWith(b)) return true;
  if (b.includes(t) || t.includes(b)) return true;
  const tw = new Set(t.split(' ').filter(w => w.length >= 3));
  const bw = new Set(b.split(' ').filter(w => w.length >= 3));
  if (tw.size === 0 || bw.size === 0) return false;
  let shared = 0;
  for (const w of bw) if (tw.has(w)) shared++;
  const overlap = shared / Math.min(tw.size, bw.size);
  return overlap >= 0.7;
}

// Strip trailing source attributions — publishers pad headlines/briefs with
// " - DW.com", " | Al Jazeera", "الجزيرة نت", domain names, etc. We peel off
// any occurrences at either end, along with the common separators, so the
// copy reads like content instead of a press-release signoff.
function stripSource(s, sourceName, domain) {
  if (!s) return s;
  let out = s;
  // Collect candidate tokens to strip
  const tokens = new Set();
  if (sourceName) {
    tokens.add(sourceName);
    // Split multi-word names so "دويتشه فيله" also matches just "فيله"
    sourceName.split(/\s+/).forEach(t => { if (t.length >= 3) tokens.add(t); });
  }
  if (domain) {
    tokens.add(domain);
    tokens.add(domain.replace(/^www\./,''));
    const bare = domain.replace(/^www\./,'').split('.')[0];
    if (bare && bare.length >= 3) tokens.add(bare);
    // Full domain as "X.com" / "X.net" etc.
    tokens.add(domain.replace(/^www\./,''));
  }
  // Generic domain pattern at end — strip any "word.tld" tail
  const GENERIC_DOMAIN = /[\s\-|–—,،]*\b[A-Za-z][A-Za-z0-9\-]{1,30}\.(?:com|net|org|co|co\.uk|ae|sa|eg|jo|ma|dz|tn|ly|ps|tv|media|news|info)\b[\s.،,]*$/i;
  // Run multiple passes until stable
  for (let i = 0; i < 4; i++) {
    const before = out;
    // Trailing source tokens with separators
    for (const t of tokens) {
      if (!t) continue;
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tailRe = new RegExp(`[\\s\\-|–—,،]*${esc}[\\s.،,]*$`, 'i');
      out = out.replace(tailRe, '').trim();
      const headRe = new RegExp(`^[\\s.،,]*${esc}[\\s\\-|–—,،]*`, 'i');
      out = out.replace(headRe, '').trim();
    }
    // Generic trailing domain
    out = out.replace(GENERIC_DOMAIN, '').trim();
    // Orphan trailing separators
    out = out.replace(/[\s\-|–—،,:.؟!]+$/, '').trim();
    if (out === before) break;
  }
  return out || s;
}

export function Post({ item, delay, onOpen, onSave, isSaved, onInterest, isInterested, onHide, onSelectSource, showImg, emg }) {
  useTick(1000);
  // 'hiding' transient state — true between the user's تجاهل tap and the
  // moment we call onHide() to actually remove the item from the feed.
  // While true, the .post-hiding class plays the fallAway animation.
  const [hiding, setHiding] = useState(false);
  // Undo window — after tap on −, show a 5s toast row instead of removing
  // immediately. Tap "تراجع" to restore, or wait for the bar to elapse.
  const [undoing, setUndoing] = useState(false);
  const undoTimerRef = useRef(null);
  const handleHide = () => {
    if (hiding || undoing) return;
    Sound.tap();
    setUndoing(true);
    undoTimerRef.current = setTimeout(() => {
      setUndoing(false);
      setHiding(true);
      setTimeout(() => onHide?.(item), 380);
    }, 5000);
  };
  const handleUndo = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    Sound.tap();
    setUndoing(false);
  };
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);
  // Transient anim states for interaction feedback
  const [plusAnim, setPlusAnim] = useState(0);
  const [saveAnim, setSaveAnim] = useState(0);
  const fireInterest = () => {
    setPlusAnim(a => a + 1);
    isInterested ? Sound.unsave() : Sound.save();
    onInterest?.(item);
  };
  const fireSave = () => {
    setSaveAnim(a => a + 1);
    isSaved ? Sound.unsave() : Sound.save();
    onSave(item.id);
  };
  // Vertical portrait thumbnail only makes sense when there's body copy to
  // sit beside it — otherwise the photo reads as an awkward sidebar. If the
  // brief is hidden (breaking news or overflowing headline), fall back to
  // the horizontal strap like any other card.
  const hasBrief = !!item.brief && !item.brk;
  const isPerson = showImg && item.realImg && hasBrief && PERSON_RE.test(item.title || '');

  // If the headline wraps to more than 3 lines, it's self-explanatory — hide
  // the body/brief so the card stays compact and doesn't duplicate content.
  // Initial guess by character length avoids a first-paint flicker; the
  // ref-based measurement below corrects it after layout.
  const titleRef = useRef(null);
  const [longTitle, setLongTitle] = useState(() => (item.title || '').length > 100);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 25;
    const lines = Math.round(el.offsetHeight / lh);
    setLongTitle(lines > 3);
  }, [item.title]);

  return (
    <div className={`post${item._new ? ' post-new' : ''}${hiding ? ' post-hiding' : ''}${item.brk ? ' post-brk' : ''}${emg ? ` post-emg post-emg-${emg}` : ''}`} data-id={item.id} style={{ animationDelay:`${delay}s` }}>
      {undoing ? (
        <div className="post-undo">
          <span className="post-undo-text">تم الإخفاء</span>
          <button type="button" className="post-undo-btn" onClick={handleUndo}>تراجع</button>
        </div>
      ) : (<>
      <div className="ph">
        <div className="pinfo">
          {/* Source logo + name as a single clickable target — tapping it
              activates the source filter on the strip above (and scrolls
              to top), so a tap on الجزيرة inside any post highlights its
              ring up top and shows only its items in the feed. */}
          <button
            type="button"
            className="pname-btn"
            onClick={(e) => { e.stopPropagation(); onSelectSource?.(item.s.n); }}
            aria-label={`عرض أخبار ${item.s.n}`}
          >
            {/* Name first in DOM order — in RTL this puts the name text at
                the visual RIGHT edge, aligning its right edge with the
                title row's right edge below. The favicon trails to its
                LEFT. Previously the favicon was first, which indented the
                name text inward from the right and broke alignment with
                the title. */}
            <span className="pname">{item.s.n}</span>
            {(item.s.logo||item.s.domain) && <img className="pname-logo" src={item.s.logo||`https://www.google.com/s2/favicons?domain=${item.s.domain}&sz=64`} alt="" loading="lazy" onError={e=>{e.currentTarget.remove();}}/>}
          </button>
          {/* Wire-service dateline — full Arabic country names between the
              source and the time, flanked by hairline pipes. Reads as a
              press-bureau filing tag. */}
          {item.flags && item.flags.length > 0 && (
            <span className="pdateline">
              {item.flags.map((c, i) => (
                <span key={c} className="pdateline-item">{countryName(c)}</span>
              ))}
            </span>
          )}
          <span className="ptime">{item.brk && <span className="ptime-dot"/>}{(() => { const t = liveTimeAgo(item.pubTs); return <span key={t} className="ptime-tick">{t}</span>; })()}</span>
        </div>
      </div>
      <div style={isPerson ? { display:'flex',gap:4,alignItems:'center' } : undefined}>
        <div style={isPerson ? { flex:1,minWidth:0 } : undefined}>
          <div ref={titleRef} className="ptitle" dir="auto" onClick={()=>{Sound.open();onOpen(item);}} style={{ cursor:'pointer', ...(longTitle ? { fontSize:15, fontWeight:500, lineHeight:1.5, color:'var(--t2)' } : {}), ...(item.brk ? { textAlign:'center' } : {}) }}>{stripSource(clean(item.title), item.s?.n, item.s?.domain)}</div>
          {!longTitle && !item.brk && item.brief && !isBriefRedundant(item.title, item.brief) && (
            <div className="pbody" dir="auto">{stripSource(clean(item.brief), item.s?.n, item.s?.domain)}</div>
          )}
        </div>
        {isPerson && (
          <div className="pphoto" onClick={()=>onOpen(item)} style={{ width:72,height:96,borderRadius:8,overflow:'hidden',flexShrink:0,cursor:'pointer',marginLeft:12 }}>
            <img src={item.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 15%',display:'block' }} onError={e=>{e.target.parentElement.style.display='none';}}/>
          </div>
        )}
      </div>
      {showImg && item.realImg && !isPerson && (
        <div className="strap strap-grid" style={{ height:90, borderRadius:8 }} onClick={()=>onOpen(item)}>
          <img src={item.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 30%',display:'block' }} onError={e=>{e.target.parentElement.style.display='none';}}/>
        </div>
      )}
      <div className="pactions pactions-pm">
        {/* All four buttons identical SVG spec — same viewBox + stroke. */}
        <button
          key={`p-${plusAnim}`}
          className={`util-btn util-ripple util-pop ${isInterested?'on':''}`}
          aria-label="مهم"
          onClick={fireInterest}
        ><Plus /></button>
        <button
          className="util-btn util-minus"
          aria-label="تجاهل"
          onClick={handleHide}
        ><Minus /></button>
        <button key={`s-${saveAnim}`} className={`util-btn ${saveAnim?'util-twinkle':''} ${isSaved?'on':''}`} aria-label="حفظ" onClick={fireSave}>
          <Save />
        </button>
        <button className="util-btn" aria-label="مشاركة" onClick={()=>{Sound.share();shareArticle(item);}}>
          <Share />
        </button>
      </div>
      </>)}
    </div>
  );
}
