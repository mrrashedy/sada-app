import { SOURCES } from '../../data/sources';
import { TOPICS } from '../../data/topics';

export function SettingsView({ sources, toggleSource, userPrefs={}, onResetOnboarding, theme, toggleTheme }) {
  const topicLabels=(userPrefs.topics||[]).map(id=>TOPICS.find(t=>t.id===id)?.label).filter(Boolean);
  return (
    <>
      {topicLabels.length>0&&(
        <div className="set-sec">
          <div className="set-sec-title">اهتماماتك المختارة</div>
          <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
            {topicLabels.map((l,i)=><span key={i} style={{ padding:'6px 14px',borderRadius:20,border:'1px solid var(--g1)',fontSize:13,color:'var(--t2)' }}>{l}</span>)}
          </div>
        </div>
      )}
      <div className="set-sec">
        <div className="set-sec-title">المصادر</div>
        {SOURCES.map((s,i)=>(
          <div className="set-row" key={i}>
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <div className="pav" style={{ width:32,height:32,fontSize:12 }}>{s.i}</div>
              <span className="set-name">{s.n}</span>
            </div>
            <button className={`toggle ${sources[i]!==false?'on':''}`} onClick={()=>toggleSource(i)}/>
          </div>
        ))}
      </div>
      <div className="set-sec">
        <div className="set-sec-title">التفضيلات</div>
        <div className="set-row"><span className="set-name">إشعارات الأخبار العاجلة</span><button className="toggle on"/></div>
        <div className="set-row"><span className="set-name">الوضع الداكن</span><button className={`toggle ${theme==='dark'?'on':''}`} onClick={toggleTheme}/></div>
        <div className="set-row"><span className="set-name">تشغيل الفيديو تلقائياً</span><button className="toggle"/></div>
      </div>
      <div className="set-sec">
        <div className="set-sec-title">شخصنة التغذية</div>
        <div style={{ fontSize:13,color:'var(--t2)',lineHeight:1.8,marginBottom:16 }}>
          تبويب <strong>مهم</strong> يُرتّب الأخبار حسب اهتماماتك. تبويب <strong>سياق</strong> يركّز على التحليلات والتقارير المعمّقة.
        </div>
        <button onClick={onResetOnboarding} style={{ background:'none',border:'1px solid var(--g1)',borderRadius:24,padding:'10px 20px',fontSize:13,fontWeight:600,color:'var(--t3)',cursor:'pointer',fontFamily:'var(--ft)',width:'100%' }}>
          إعادة ضبط التفضيلات
        </button>
      </div>
      <div style={{ padding:20,textAlign:'center' }}>
        <div style={{ fontSize:11,color:'var(--t4)',marginBottom:4 }}>صَدى v3.0</div>
        <div style={{ fontSize:11,color:'var(--t4)' }}>أخبار العالم في مكانٍ واحد</div>
      </div>
    </>
  );
}
