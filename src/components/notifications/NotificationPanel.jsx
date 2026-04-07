import { liveTimeAgo } from '../../lib/timeAgo';
import { useTick } from '../../hooks/useTick';

export function NotificationPanel({ allFeed, onClose, onOpen }) {
  useTick(1000);
  return (
    <div className="srch" style={{ direction:'rtl' }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'.5px solid var(--g1)',paddingBottom:12,marginBottom:16 }}>
        <span style={{ fontSize:18,fontWeight:800,color:'var(--t1)' }}>التحديثات</span>
        <button className="srch-c" onClick={onClose}>إغلاق</button>
      </div>
      {allFeed.length===0&&<div className="empty"><div className="empty-title">لا توجد تحديثات</div></div>}
      {allFeed.slice(0,30).map((item,i)=>(
        <div key={item.id} style={{ padding:'12px 0',borderBottom:'.5px solid var(--g1)',cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start' }} onClick={()=>{onOpen(item);onClose();}}>
          <div className="pav" style={{ width:32,height:32,fontSize:11,flexShrink:0,marginTop:2 }}>{item.s.i}</div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:3 }}>
              <span style={{ fontSize:12,fontWeight:700,color:'var(--t1)' }}>{item.s.n}</span>
              <span style={{ fontSize:11,color:'var(--t4)' }}>{liveTimeAgo(item.pubTs)}</span>
              {item.brk&&<span style={{ fontSize:9,fontWeight:700,color:'var(--rd)',border:'1px solid rgba(183,28,28,.15)',padding:'1px 6px',borderRadius:3 }}>عاجل</span>}
            </div>
            <div style={{ fontSize:14,fontWeight:600,lineHeight:1.6,color:'var(--t1)' }}>{item.title}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
