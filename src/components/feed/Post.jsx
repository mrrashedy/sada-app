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

export function Post({ item, delay, onOpen, onSave, isSaved, onInterest, isInterested, onHide, showImg }) {
  useTick(1000);
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
    <div className={`post${item._new ? ' post-new' : ''}`} data-id={item.id} style={{ animationDelay:`${delay}s` }}>
      <div className="ph">
        <div className="pinfo">{(item.s.logo||item.s.domain) && <img className="pname-logo" src={item.s.logo||`https://www.google.com/s2/favicons?domain=${item.s.domain}&sz=64`} alt="" loading="lazy" onError={e=>{e.currentTarget.remove();}}/>}<span className="pname">{item.s.n}</span><span className="ptime">{item.brk && <span className="ptime-dot"/>}{liveTimeAgo(item.pubTs)}</span></div>
        <button className="ib" style={{ color:'var(--t4)', padding:0 }}>{I.more()}</button>
      </div>
      <div style={isPerson ? { display:'flex',gap:4,alignItems:'center' } : undefined}>
        <div style={isPerson ? { flex:1,minWidth:0 } : undefined}>
          <div ref={titleRef} className="ptitle" dir="auto" onClick={()=>{Sound.open();onOpen(item);}} style={{ cursor:'pointer' }}>{clean(item.title)}</div>
          {!longTitle && (item.brief || (item.tags && item.tags.length > 0) || (item.flags && item.flags.length > 0)) && (
            <div className="pbody" dir="auto">
              {item.brief && clean(item.brief)}
              {/* Country tags first — geographic context is the most natural
                  hook for "what is this story about." Replaces the previous
                  flag-image strip in the post header (.ph). */}
              {item.flags && item.flags.length > 0 && item.flags.map(c => (
                <span key={`f-${c}`} className="ptag ptag-inline ptag-country">{countryName(c)}</span>
              ))}
              {/* Then topic / category tags. */}
              {item.tags && item.tags.length > 0 && item.tags.map((t, i) => (
                <span key={`t-${i}`} className="ptag ptag-inline">{clean(t)}</span>
              ))}
            </div>
          )}
        </div>
        {isPerson && (
          <div onClick={()=>onOpen(item)} style={{ width:72,height:96,borderRadius:10,overflow:'hidden',flexShrink:0,cursor:'pointer',marginLeft:12 }}>
            <img src={item.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 15%',display:'block' }} onError={e=>{e.target.parentElement.style.display='none';}}/>
          </div>
        )}
      </div>
      {showImg && item.realImg && !isPerson && (
        <div className="strap strap-grid" style={{ height:90, borderRadius:10 }} onClick={()=>onOpen(item)}>
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
          onClick={() => { Sound.tap(); onHide?.(item); }}
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
