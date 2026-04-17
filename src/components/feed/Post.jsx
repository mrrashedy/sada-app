import { useState, useLayoutEffect, useRef } from 'react';
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
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
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

export function Post({ item, delay, onOpen, onSave, isSaved, onInterest, isInterested, onHide, onSelectSource, showImg }) {
  useTick(1000);
  // 'hiding' transient state — true between the user's تجاهل tap and the
  // moment we call onHide() to actually remove the item from the feed.
  // While true, the .post-hiding class plays the fallAway animation.
  const [hiding, setHiding] = useState(false);
  const handleHide = () => {
    if (hiding) return;
    Sound.tap();
    setHiding(true);
    // Match the .post-hiding animation duration (380 ms in CSS).
    setTimeout(() => onHide?.(item), 380);
  };
  const isPerson = showImg && item.realImg && PERSON_RE.test(item.title || '');

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
    <div className={`post${item._new ? ' post-new' : ''}${hiding ? ' post-hiding' : ''}`} data-id={item.id} style={{ animationDelay:`${delay}s` }}>
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
          <span className="ptime">{item.brk && <span className="ptime-dot"/>}{liveTimeAgo(item.pubTs)}</span>
        </div>
        <button className="ib" style={{ color:'var(--t4)', padding:0 }}>{I.more()}</button>
      </div>
      <div style={isPerson ? { display:'flex',gap:4,alignItems:'center' } : undefined}>
        <div style={isPerson ? { flex:1,minWidth:0 } : undefined}>
          <div ref={titleRef} className="ptitle" dir="auto" onClick={()=>{Sound.open();onOpen(item);}} style={{ cursor:'pointer' }}>{clean(item.title)}</div>
          {!longTitle && item.brief && (
            <div className="pbody" dir="auto">{clean(item.brief)}</div>
          )}
        </div>
        {isPerson && (
          <div onClick={()=>onOpen(item)} style={{ width:72,height:96,borderRadius:10,overflow:'hidden',flexShrink:0,cursor:'pointer',marginLeft:12 }}>
            <img src={item.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 15%',display:'block' }} onError={e=>{e.target.parentElement.style.display='none';}}/>
          </div>
        )}
      </div>
      {showImg && item.realImg && !isPerson && (
        <div className="strap strap-grid" style={{ height:72, borderRadius:8 }} onClick={()=>onOpen(item)}>
          <img src={item.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 30%',display:'block' }} onError={e=>{e.target.parentElement.style.display='none';}}/>
        </div>
      )}
      <div className="pactions pactions-pm">
        {/* All four buttons identical SVG spec — same viewBox + stroke. */}
        <button
          className={`util-btn ${isInterested?'on':''}`}
          aria-label="مهم"
          onClick={() => { isInterested ? Sound.unsave() : Sound.save(); onInterest?.(item); }}
        ><Plus /></button>
        <button
          className="util-btn util-minus"
          aria-label="تجاهل"
          onClick={handleHide}
        ><Minus /></button>
        <button className={`util-btn ${isSaved?'on':''}`} aria-label="حفظ" onClick={()=>{isSaved?Sound.unsave():Sound.save();onSave(item.id);}}>
          <Save />
        </button>
        <button className="util-btn" aria-label="مشاركة" onClick={()=>{Sound.share();shareArticle(item);}}>
          <Share />
        </button>
      </div>
    </div>
  );
}
