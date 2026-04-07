import { useState, useRef, useEffect } from 'react'
import { I } from '../shared/Icons'
import { SOURCES } from '../../data/sources'

export function SearchView({ onClose, feed=[], onOpen }) {
  const ref=useRef(null);
  const [q,setQ]=useState('');
  useEffect(()=>{ ref.current?.focus(); },[]);
  const results=q.length>1?feed.filter(item=>item.title?.includes(q)||item.body?.includes(q)||item.s?.n?.includes(q)||item.tag?.includes(q)):[];
  const tags=['سياسة','اقتصاد','تقنية','رياضة','ثقافة','طاقة','ذكاء اصطناعي','مناخ','فضاء','صحة'];
  return (
    <div className="srch">
      <div className="srch-bar">
        {I.search()}
        <input ref={ref} className="srch-in" placeholder="ابحث في الأخبار..." value={q} onChange={e=>setQ(e.target.value)}/>
        <button className="srch-c" onClick={onClose}>إلغاء</button>
      </div>
      {q.length>1&&(<>
        <div className="srch-sec">{results.length>0?`${results.length} نتيجة`:'لا توجد نتائج'}</div>
        {results.map(item=>(<div key={item.id} style={{ padding:'14px 0',borderBottom:'.5px solid var(--g1)',cursor:'pointer' }} onClick={()=>{onOpen(item);onClose();}}>
          <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4 }}>
            {item.tag&&<div className={`ptag ${item.brk?'brk':''}`} style={{ margin:0 }}>{item.tag}</div>}
            <span style={{ fontSize:12,fontWeight:700,color:'var(--t1)' }}>{item.s?.n}</span>
            <span style={{ fontSize:11,color:'var(--t4)' }}>{item.t}</span>
          </div>
          <div style={{ fontSize:15,fontWeight:700,lineHeight:1.7,color:'var(--t1)' }}>{item.title}</div>
          {item.body&&<div style={{ fontSize:12,color:'var(--t3)',marginTop:4 }}>{item.body.slice(0,80)}…</div>}
        </div>))}
      </>)}
      {q.length<2&&(<>
        <div className="srch-sec">اكتشف</div>
        <div className="srch-tags">{tags.map((t,i)=><button key={i} className="srch-tag" onClick={()=>setQ(t)}>{t}</button>)}</div>
        <div className="srch-sec">مصادر مقترحة</div>
        {SOURCES.slice(0,6).map((s,i)=>(
          <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:i<5?'.5px solid var(--g1)':'none' }}>
            <div className="pav" style={{ width:40,height:40,fontSize:15 }}>{s.i}</div>
            <div style={{ flex:1 }}><div style={{ fontSize:14,fontWeight:600,color:'var(--t1)' }}>{s.n}</div><div style={{ fontSize:11,color:'var(--t4)' }}>مصدر إخباري</div></div>
            <button style={{ fontSize:12,fontWeight:600,color:'var(--bk)',background:'none',border:'1px solid var(--g1)',borderRadius:20,padding:'5px 16px',cursor:'pointer',fontFamily:'var(--ft)' }}>متابعة</button>
          </div>
        ))}
      </>)}
    </div>
  );
}
