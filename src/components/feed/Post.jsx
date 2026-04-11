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

  return (
    <div className="post" style={{ animationDelay:`${delay}s` }}>
      <div className="ph">
        <div className="pav">{item.s.i}</div>
        <div className="pinfo"><span className="pname">{item.s.n}</span><span className="ptime">{liveTimeAgo(item.pubTs)}</span></div>
        <button className="ib" style={{ color:'var(--t4)' }}>{I.more()}</button>
      </div>
      {item.brk && <div className="ptag brk" style={{ marginBottom:6 }}>عاجل</div>}
      <div style={isPerson ? { display:'flex',gap:12,alignItems:'center' } : undefined}>
        <div style={isPerson ? { flex:1,minWidth:0 } : undefined}>
          <div className="ptitle" onClick={()=>{Sound.open();onOpen(item);}} style={{ cursor:'pointer' }}>{clean(item.title)}</div>
          {item.body && <div className="pbody">{clean(item.body)}</div>}
          {item.tags&&item.tags.length>0 && (
            <div style={{ display:'flex',gap:5,flexWrap:'wrap',marginTop:6 }}>
              {item.tags.map((t,i) => <span key={i} className="ptag">{clean(t)}</span>)}
            </div>
          )}
        </div>
        {isPerson && (
          <div onClick={()=>onOpen(item)} style={{ width:72,height:96,borderRadius:10,overflow:'hidden',border:'2px solid var(--g1)',flexShrink:0,cursor:'pointer' }}>
            <img src={item.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 15%',display:'block' }} onError={e=>{e.target.parentElement.style.display='none';}}/>
          </div>
        )}
      </div>
      {showImg && item.realImg && !isPerson && (() => {
        const v = (item.id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0) % 2;
        const shapes = [
          { h:90, r:10 },
          { h:72, r:10 },
        ];
        const s = shapes[v];
        return (
          <div className="strap" style={{ height:s.h, borderRadius:s.r }} onClick={()=>onOpen(item)}>
            <img src={item.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 20%',display:'block',filter:'saturate(1.3) contrast(1.05)' }} onError={e=>{e.target.style.display='none';}}/>
          </div>
        );
      })()}
      <div className="pactions">
        <ReactionBar articleId={item.id} counts={reactionCounts} userReactions={userReactions} onToggle={onToggleReaction} commentCount={commentCount} onComment={()=>onComment?.(item)} compact />
        <button className="act" onClick={()=>{Sound.share();shareArticle(item);}}>{I.share()} مشاركة</button>
        <button className={`act ${isSaved?'saved':''}`} onClick={()=>{isSaved?Sound.unsave():Sound.save();onSave(item.id);}}>{I.bookmark(isSaved)}</button>
      </div>
    </div>
  );
}
