import { useState, useRef, useEffect } from 'react'
import { I } from '../shared/Icons'
import { SOURCES } from '../../data/sources'
import { searchProfiles } from '../../lib/supabase'

export function SearchView({ onClose, feed=[], onOpen, onOpenProfile }) {
  const ref=useRef(null);
  const [q,setQ]=useState('');
  const [tab,setTab]=useState('news'); // 'news' | 'people'
  const [people,setPeople]=useState([]);
  const [searchingPeople,setSearchingPeople]=useState(false);

  useEffect(()=>{ ref.current?.focus(); },[]);

  // Search news
  const results=q.length>1?feed.filter(item=>item.title?.includes(q)||item.body?.includes(q)||item.s?.n?.includes(q)||item.tag?.includes(q)):[];

  // Search people (debounced)
  useEffect(()=>{
    if(q.length<2 || tab!=='people') { setPeople([]); return; }
    const t=setTimeout(async()=>{
      setSearchingPeople(true);
      const data=await searchProfiles(q);
      setPeople(data);
      setSearchingPeople(false);
    },300);
    return ()=>clearTimeout(t);
  },[q,tab]);

  const tags=['سياسة','اقتصاد','تقنية','رياضة','ثقافة','طاقة','ذكاء اصطناعي','مناخ','فضاء','صحة'];

  return (
    <div className="srch">
      <div className="srch-bar">
        {I.search()}
        <input ref={ref} className="srch-in" placeholder="ابحث في الأخبار أو الأشخاص..." value={q} onChange={e=>setQ(e.target.value)}/>
        <button className="srch-c" onClick={onClose}>إلغاء</button>
      </div>

      {/* Search tabs */}
      {q.length>1&&(
        <div style={{ display:'flex',borderBottom:'.5px solid var(--g1)' }}>
          {[{id:'news',l:'أخبار'},{id:'people',l:'أشخاص'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1,padding:'10px',background:'none',border:'none',fontSize:13,fontWeight:tab===t.id?700:500,color:tab===t.id?'var(--bk)':'var(--t4)',cursor:'pointer',fontFamily:'var(--ft)',borderBottom:tab===t.id?'2px solid var(--bk)':'2px solid transparent' }}>
              {t.l}
            </button>
          ))}
        </div>
      )}

      {/* News results */}
      {q.length>1&&tab==='news'&&(<>
        <div className="srch-sec" style={{ marginTop:12 }}>{results.length>0?`${results.length} نتيجة`:'لا توجد نتائج'}</div>
        {results.slice(0,30).map(item=>(<div key={item.id} style={{ padding:'14px 0',borderBottom:'.5px solid var(--g1)',cursor:'pointer' }} onClick={()=>{onOpen(item);onClose();}}>
          <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4 }}>
            {item.tag&&<div className={`ptag ${item.brk?'brk':''}`} style={{ margin:0 }}>{item.tag}</div>}
            <span style={{ fontSize:12,fontWeight:700,color:'var(--t1)' }}>{item.s?.n}</span>
            <span style={{ fontSize:11,color:'var(--t4)' }}>{item.t}</span>
          </div>
          <div style={{ fontSize:15,fontWeight:700,lineHeight:1.7,color:'var(--t1)' }}>{item.title}</div>
          {item.body&&<div style={{ fontSize:12,color:'var(--t3)',marginTop:4 }}>{item.body.slice(0,80)}…</div>}
        </div>))}
      </>)}

      {/* People results */}
      {q.length>1&&tab==='people'&&(
        <div style={{ paddingTop:8 }}>
          {searchingPeople&&<div style={{ textAlign:'center',padding:20,color:'var(--t4)',fontSize:13 }}>جاري البحث…</div>}
          {!searchingPeople&&people.length===0&&<div style={{ textAlign:'center',padding:20,color:'var(--t4)',fontSize:13 }}>لا توجد نتائج</div>}
          {people.map(p=>(
            <div key={p.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'.5px solid var(--g1)',cursor:'pointer' }} onClick={()=>onOpenProfile?.(p.id)}>
              <div style={{ width:44,height:44,borderRadius:'50%',background:'var(--rd)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,color:'#fff',flexShrink:0 }}>
                {(p.display_name||'?')[0]}
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:14,fontWeight:700,color:'var(--t1)' }}>{p.display_name}</div>
                {p.username&&<div style={{ fontSize:12,color:'var(--t3)' }}>@{p.username}</div>}
                {p.bio&&<div style={{ fontSize:12,color:'var(--t4)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.bio}</div>}
              </div>
              <div style={{ fontSize:11,color:'var(--t4)',textAlign:'center',flexShrink:0 }}>
                <div style={{ fontWeight:700,fontSize:14,color:'var(--t2)' }}>{p.follower_count||0}</div>
                <div>متابِع</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Default: discover */}
      {q.length<2&&(<>
        <div className="srch-sec" style={{ marginTop:12 }}>اكتشف</div>
        <div className="srch-tags">{tags.map((t,i)=><button key={i} className="srch-tag" onClick={()=>{setTab('news');setQ(t);}}>{t}</button>)}</div>
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
