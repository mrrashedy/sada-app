import { useState, useLayoutEffect, useRef } from 'react';
import { I } from '../shared/Icons';
import { useTick } from '../../hooks/useTick';
import { liveTimeAgo } from '../../lib/timeAgo';
import { Sound } from '../../lib/sounds';
import { shareArticle } from '../../lib/shareCard';
import { ReactionBar } from '../social/ReactionBar';

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

export function Post({ item, delay, onOpen, onSave, isSaved, onInterest, isInterested, showImg, reactionCounts, userReactions, onToggleReaction, commentCount, onComment }) {
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
    <div className={`post${item._new ? ' post-new' : ''}`} style={{ animationDelay:`${delay}s` }}>
      <div className="ph">
        <div className="pinfo">{(item.s.logo||item.s.domain) && <img className="pname-logo" src={item.s.logo||`https://www.google.com/s2/favicons?domain=${item.s.domain}&sz=64`} alt="" loading="lazy" onError={e=>{e.currentTarget.remove();}}/>}<span className="pname">{item.s.n}</span><span className="ptime">{item.brk && <span className="ptime-dot"/>}{liveTimeAgo(item.pubTs)}</span></div>
        <button className="ib" style={{ color:'var(--t4)', padding:0 }}>{I.more()}</button>
      </div>
      <div style={isPerson ? { display:'flex',gap:4,alignItems:'center' } : undefined}>
        <div style={isPerson ? { flex:1,minWidth:0 } : undefined}>
          <div ref={titleRef} className="ptitle" onClick={()=>{Sound.open();onOpen(item);}} style={{ cursor:'pointer' }}>{clean(item.title)}</div>
          {!longTitle && (item.brief || (item.tags && item.tags.length > 0)) && (
            <div className="pbody">
              {item.brief && clean(item.brief)}
              {item.tags && item.tags.length > 0 && item.tags.map((t, i) => (
                <span key={i} className="ptag ptag-inline">{clean(t)}</span>
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
      <div className="pactions">
        <ReactionBar articleId={item.id} counts={reactionCounts} userReactions={userReactions} onToggle={onToggleReaction} commentCount={commentCount} onComment={()=>onComment?.(item)} compact />
        <button className="act" onClick={()=>{Sound.share();shareArticle(item);}}>{I.share()}</button>
        <button className={`act ${isSaved?'saved':''}`} onClick={()=>{isSaved?Sound.unsave():Sound.save();onSave(item.id);}}>{I.bookmark(isSaved)}</button>
      </div>
    </div>
  );
}
