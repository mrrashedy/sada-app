import { SOURCES } from '../../data/sources';
import { TOPICS } from '../../data/topics';

export function SettingsView({ sources, toggleSource, userPrefs={}, onResetOnboarding, theme, toggleTheme, auth={}, onOpenAuth, onOpenProfile }) {
  const topicLabels=(userPrefs.topics||[]).map(id=>TOPICS.find(t=>t.id===id)?.label).filter(Boolean);
  return (
    <>
      {/* Account section */}
      <div className="set-sec">
        <div className="set-sec-title">الحساب</div>
        {auth.isLoggedIn ? (
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:16 }}>
              <div style={{ width:48,height:48,borderRadius:'50%',background:'var(--rd)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:'#fff',flexShrink:0 }}>
                {(auth.profile?.display_name||'?')[0]}
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:15,fontWeight:700,color:'var(--t1)' }}>{auth.profile?.display_name||'مستخدم'}</div>
                {auth.profile?.username && <div style={{ fontSize:12,color:'var(--t3)' }}>@{auth.profile.username}</div>}
                <div style={{ fontSize:11,color:'var(--t4)',marginTop:2 }}>{auth.user?.email}</div>
              </div>
            </div>
            <div style={{ display:'flex',gap:10 }}>
              <button onClick={onOpenProfile} style={{ flex:1,background:'none',border:'1px solid var(--g1)',borderRadius:10,padding:'10px',fontSize:13,fontWeight:600,color:'var(--t2)',cursor:'pointer',fontFamily:'var(--ft)' }}>
                تعديل الملف الشخصي
              </button>
              <button onClick={()=>auth.signOut()} style={{ flex:1,background:'none',border:'1px solid var(--g1)',borderRadius:10,padding:'10px',fontSize:13,fontWeight:600,color:'var(--t3)',cursor:'pointer',fontFamily:'var(--ft)' }}>
                تسجيل الخروج
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize:13,color:'var(--t3)',lineHeight:1.8,marginBottom:14 }}>
              سجّل الدخول لمزامنة محفوظاتك واهتماماتك عبر أجهزتك
            </div>
            <button onClick={onOpenAuth} style={{ width:'100%',background:'var(--bk)',color:'#fff',border:'none',borderRadius:12,padding:'13px',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'var(--ft)' }}>
              تسجيل الدخول أو إنشاء حساب
            </button>
          </div>
        )}
      </div>

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
        <div style={{ fontSize:11,color:'var(--t4)',marginBottom:4 }}>غرفة الأخبار v4.0</div>
        <div style={{ fontSize:11,color:'var(--t4)' }}>أخبار العالم في مكانٍ واحد</div>
      </div>
    </>
  );
}
