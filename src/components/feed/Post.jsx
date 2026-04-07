import { I } from '../shared/Icons';
import { useTick } from '../../hooks/useTick';
import { liveTimeAgo } from '../../lib/timeAgo';
import { Sound } from '../../lib/sounds';

export function Post({ item, delay, onOpen, onSave, isSaved, showImg }) {
  useTick(1000);
  return (
    <div className="post" style={{ animationDelay:`${delay}s` }}>
      <div className="ph">
        <div className="pav">{item.s.i}</div>
        <div className="pinfo"><span className="pname">{item.s.n}</span><span className="ptime">{liveTimeAgo(item.pubTs)}</span></div>
        <button className="ib" style={{ color:'var(--t4)' }}>{I.more()}</button>
      </div>
      {item.brk && <div className="ptag brk" style={{ marginBottom:6 }}>عاجل</div>}
      <div className="ptitle" onClick={()=>{Sound.open();onOpen(item);}} style={{ cursor:'pointer' }}>{item.title}</div>
      {item.body && <div className="pbody">{item.body}</div>}
      {item.tags&&item.tags.length>0 && (
        <div style={{ display:'flex',gap:6,flexWrap:'wrap',marginTop:8 }}>
          {item.tags.map((t,i) => <span key={i} className="ptag">{t}</span>)}
        </div>
      )}
      {showImg && item.realImg && (
        <div className="strap" onClick={()=>onOpen(item)}>
          <img src={item.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',display:'block',filter:'saturate(1.3) contrast(1.05)' }} onError={e=>{e.target.style.display='none';}}/>
        </div>
      )}
      <div className="pactions">
        <button className="act" onClick={()=>{Sound.open();onOpen(item);}}>{I.link()} اقرأ المقال</button>
        <button className="act" onClick={()=>{Sound.share();if(navigator.share) navigator.share({title:item.title,url:item.link}).catch(()=>{}); else if(item.link) navigator.clipboard?.copyText(item.link); }}>{I.share()} مشاركة</button>
        <button className={`act ${isSaved?'saved':''}`} onClick={()=>{isSaved?Sound.unsave():Sound.save();onSave(item.id);}}>{I.bookmark(isSaved)}</button>
      </div>
    </div>
  );
}
