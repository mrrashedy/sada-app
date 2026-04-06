import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNews } from "./lib/useNews";

const SOURCES = [
  { n:"الجزيرة",     i:"ج",  id:"aljazeera"  },
  { n:"العربية",     i:"ع",  id:"alarabiya"  },
  { n:"BBC عربي",    i:"B",  id:"bbc"         },
  { n:"سكاي نيوز",  i:"S",  id:"skynews"     },
  { n:"فرانس ٢٤",   i:"F",  id:"france24"    },
  { n:"RT عربي",     i:"R",  id:"rt"          },
  { n:"دويتشه فيله",i:"D",  id:"dw"          },
  { n:"CNBC عربية",  i:"C",  id:"cnbc"        },
  { n:"المصري اليوم",i:"م", id:"almasry"     },
  { n:"عكاظ",        i:"ك",  id:"okaz"        },
  { n:"السومرية",    i:"سم", id:"alsumaria"   },
  { n:"الخليج",      i:"خ",  id:"alkhaleej"   },
  { n:"24 الإمارات", i:"٢",  id:"uae24"       },
  { n:"الشرق",       i:"ش",  id:"alsharq"     },
  { n:"دوحة نيوز",   i:"ه",  id:"dohanews"    },
  { n:"البوابة",     i:"ب",  id:"albawaba"    },
  { n:"Arab News",   i:"A",  id:"arabnews"    },
  { n:"اليوم",       i:"ل",  id:"alyaum"      },
  { n:"الدستور",     i:"ت",  id:"dostor"      },
  { n:"لوسيل",       i:"لس", id:"lusail"      },
];

const TOPICS = [
  { id:"politics",    label:"سياسة",      icon:"🏛️" },
  { id:"economy",     label:"اقتصاد",     icon:"📈" },
  { id:"tech",        label:"تقنية",      icon:"💻" },
  { id:"sports",      label:"رياضة",      icon:"⚽" },
  { id:"culture",     label:"ثقافة وفن",  icon:"🎭" },
  { id:"science",     label:"علوم وفضاء", icon:"🚀" },
  { id:"health",      label:"صحة",        icon:"🏥" },
  { id:"environment", label:"بيئة ومناخ", icon:"🌿" },
];

const TOPIC_KEYWORDS = {
  politics:    ['سياسة','سياسي','رئيس','وزير','حكومة','برلمان','انتخاب','دبلوماسي','قمة','مفاوضات','جيش','حرب','سلام','ثورة'],
  economy:     ['اقتصاد','اقتصادي','مال','بورصة','نفط','طاقة','استثمار','بنك','دولار','تجارة','أسواق','شركة','تضخم','صادرات'],
  tech:        ['تقنية','ذكاء اصطناعي','تكنولوجيا','رقمي','إنترنت','برمجة','تطبيق','ابتكار','روبوت','سيبراني','بيانات','منصة','غوغل','آبل','مايكروسوفت'],
  sports:      ['رياضة','رياضي','كرة','قدم','فريق','بطولة','ملعب','لاعب','مباراة','دوري','كأس','أولمبي','منتخب','تنس','سلة','ميدالية','هدف','فوز'],
  culture:     ['ثقافة','فن','سينما','موسيقى','أدب','مهرجان','فنان','مسرح','رواية','جائزة','معرض','متحف','تراث','شعر','ممثل','فيلم','مسلسل','إنتاج'],
  science:     ['علوم','فضاء','بحث','اكتشاف','ناسا','قمر','مريخ','نجم','نووي','تجربة','علمي','دراسة','مختبر','صاروخ','مدار'],
  health:      ['صحة','طب','مرض','علاج','مستشفى','وباء','لقاح','دواء','طبيب','سرطان','فيروس','جراحة','صحي','تغذية','جائحة'],
  environment: ['بيئة','مناخ','تلوث','طاقة متجددة','احتباس','انبعاثات','غابات','محيط','تصحر','جفاف','فيضان','زلزال'],
};

function scoreByTopics(item, topicIds) {
  if (!topicIds || topicIds.length === 0) return 0;
  const text = ((item.title||'')+' '+(item.body||'')+' '+(item.tag||'')).toLowerCase();
  return topicIds.flatMap(id => TOPIC_KEYWORDS[id]||[]).filter(kw => text.includes(kw)).length;
}

const REGIONS = [
  { id:"gulf",    label:"الخليج العربي",  flag:"🇸🇦" },
  { id:"levant",  label:"المشرق العربي",  flag:"🌙"  },
  { id:"nafrika", label:"شمال أفريقيا",   flag:"🇲🇦" },
  { id:"europe",  label:"أوروبا",         flag:"🇪🇺" },
  { id:"americas",label:"الأمريكتان",     flag:"🌎"  },
  { id:"asia",    label:"آسيا",           flag:"🌏"  },
  { id:"global",  label:"أخبار عالمية",   flag:"🌍"  },
];

const GEO_MAP = [
  { id:"sa", city:"الرياض",   country:"السعودية", lat:24.71, lng:46.68, keywords:["السعودية","الرياض","سعودي","أرامكو","نيوم","الخليج"] },
  { id:"ae", city:"دبي",      country:"الإمارات", lat:25.20, lng:55.27, keywords:["الإمارات","دبي","أبوظبي","إماراتي"] },
  { id:"eg", city:"القاهرة",  country:"مصر",      lat:30.04, lng:31.24, keywords:["مصر","القاهرة","مصري","الإسكندرية","السيسي"] },
  { id:"qa", city:"الدوحة",   country:"قطر",      lat:25.29, lng:51.53, keywords:["قطر","الدوحة","قطري"] },
  { id:"iq", city:"بغداد",    country:"العراق",   lat:33.34, lng:44.40, keywords:["العراق","بغداد","عراقي","البصرة"] },
  { id:"sy", city:"دمشق",     country:"سوريا",    lat:33.51, lng:36.29, keywords:["سوريا","دمشق","سوري","حلب","إدلب"] },
  { id:"lb", city:"بيروت",    country:"لبنان",    lat:33.89, lng:35.50, keywords:["لبنان","بيروت","لبناني"] },
  { id:"ps", city:"غزة",      country:"فلسطين",   lat:31.50, lng:34.47, keywords:["فلسطين","غزة","الضفة","القدس","رفح"] },
  { id:"tr", city:"أنقرة",    country:"تركيا",    lat:39.93, lng:32.85, keywords:["تركيا","أنقرة","إسطنبول","أردوغان"] },
  { id:"ir", city:"طهران",    country:"إيران",    lat:35.69, lng:51.39, keywords:["إيران","طهران","إيراني","خامنئي"] },
  { id:"ly", city:"طرابلس",   country:"ليبيا",    lat:32.90, lng:13.18, keywords:["ليبيا","طرابلس","ليبي"] },
  { id:"tn", city:"تونس",     country:"تونس",     lat:36.82, lng:10.17, keywords:["تونس","تونسي"] },
  { id:"ma", city:"الرباط",   country:"المغرب",   lat:34.02, lng:-6.84, keywords:["المغرب","الرباط","مراكش","مغربي"] },
  { id:"us", city:"واشنطن",   country:"أمريكا",   lat:38.91, lng:-77.04,keywords:["أمريكا","واشنطن","الولايات المتحدة","ترامب","بايدن"] },
  { id:"ru", city:"موسكو",    country:"روسيا",    lat:55.75, lng:37.62, keywords:["روسيا","موسكو","بوتين"] },
  { id:"cn", city:"بكين",     country:"الصين",    lat:39.90, lng:116.41,keywords:["الصين","بكين","صيني"] },
  { id:"gb", city:"لندن",     country:"بريطانيا", lat:51.51, lng:-0.13, keywords:["بريطانيا","لندن","المملكة المتحدة"] },
  { id:"fr", city:"باريس",    country:"فرنسا",    lat:48.86, lng:2.35,  keywords:["فرنسا","باريس","فرنسي","ماكرون"] },
  { id:"de", city:"برلين",    country:"ألمانيا",  lat:52.52, lng:13.40, keywords:["ألمانيا","برلين","ألماني"] },
  { id:"jo", city:"عمّان",    country:"الأردن",   lat:31.96, lng:35.95, keywords:["الأردن","عمّان","أردني"] },
  { id:"ye", city:"صنعاء",    country:"اليمن",    lat:15.37, lng:44.19, keywords:["اليمن","صنعاء","يمني","الحوثي"] },
  { id:"sd", city:"الخرطوم",  country:"السودان",  lat:15.55, lng:32.53, keywords:["السودان","الخرطوم","سوداني"] },
  { id:"jp", city:"طوكيو",    country:"اليابان",  lat:35.68, lng:139.65,keywords:["اليابان","طوكيو","ياباني"] },
  { id:"in", city:"نيودلهي",  country:"الهند",    lat:28.61, lng:77.23, keywords:["الهند","نيودلهي","هندي","مودي"] },
];

const FEED = [
  { id:1,  s:SOURCES[0], t:"٣ د",  tag:"عاجل",  brk:true, bg:"linear-gradient(135deg,#1a1a2e,#0f3460)", title:"قمة الرياض تختتم بإعلان تاريخي — خارطة طريق اقتصادية جديدة للشرق الأوسط", body:"القادة يتوافقون على إنشاء صندوق إقليمي بقيمة ١٠٠ مليار دولار لدعم التحول الرقمي والتكامل الاقتصادي في المنطقة", lk:"12.4K", cm:"2.1K", sh:"5.8K" },
  { id:2,  s:SOURCES[1], t:"١٥ د", tag:"حصري",            bg:"linear-gradient(135deg,#2d3436,#636e72)", title:"حوار خاص مع رئيس أرامكو: ٥٠ مليار دولار للطاقة المتجددة والاقتصاد الأخضر", body:"في مقابلة حصرية يكشف الرئيس التنفيذي عن خطط الشركة لقيادة التحول في قطاع الطاقة والاستثمار", lk:"8.7K", cm:"1.3K", sh:"3.2K" },
  { id:3,  s:SOURCES[4], t:"٢٨ د",                        title:"الدولار يتراجع أمام سلة العملات بعد بيانات التوظيف الأمريكية", body:"شهدت الأسواق والبورصة تحركات لافتة مع صدور تقرير الوظائف الاقتصادي الذي جاء دون التوقعات", lk:"3.2K", cm:"891", sh:"1.5K" },
  { id:4,  s:SOURCES[2], t:"٤٥ د", tag:"فيديو", vid:true, bg:"linear-gradient(135deg,#0c0c0c,#1a1a2e)", title:"لحظة إطلاق أول قمر صناعي عربي مشترك من قاعدة الإمارات الفضائية", body:"نجاح تاريخي في علوم الفضاء والتقنية العربية مع إطلاق القمر الصناعي في مداره", lk:"31.5K", cm:"4.2K", sh:"18.3K" },
  { id:5,  s:SOURCES[5], t:"١ س",  tag:"تحليل",           bg:"linear-gradient(135deg,#434343,#000)", title:"كيف يُعيد الذكاء الاصطناعي والتقنية تشكيل صناعة الإعلام العربي؟", body:"تحليل معمّق لتأثير التقنيات الحديثة على غرف الأخبار وصناعة المحتوى الرقمي", lk:"4.9K", cm:"723", sh:"2.1K" },
  { id:6,  s:SOURCES[3], t:"٢ س",                         bg:"linear-gradient(135deg,#3d3d3d,#575757)", title:"محادثات جنيف تحقق اختراقاً دبلوماسياً وسياسياً بشأن الملف النووي", body:"مصادر مطلعة تكشف عن تفاصيل الاتفاق السياسي الذي وصفه المبعوث الأممي بأنه خطوة تاريخية", lk:"7.8K", cm:"2.9K", sh:"4.4K" },
  { id:7,  s:SOURCES[6], t:"٣ س",  tag:"رأي",             title:"لماذا يحتاج العالم العربي إلى ثورة في صناعة الثقافة والفن والنشر الرقمي؟", body:"الفجوة بين المحتوى الثقافي والفني العربي والعالمي تتسع يوماً بعد يوم رغم وجود المواهب", lk:"2.1K", cm:"345", sh:"987" },
  { id:8,  s:SOURCES[0], t:"٤ س",  tag:"تقرير",           bg:"linear-gradient(135deg,#141e30,#243b55)", title:"المدن الذكية والتقنية في الخليج — رحلة داخل نيوم ومدينة المستقبل", body:"أين وصلت المشاريع الكبرى وما التحديات التي تواجهها على أرض الواقع", lk:"3.3K", cm:"512", sh:"1.8K" },
  { id:9,  s:SOURCES[2], t:"٥ س",  tag:"رياضة",           title:"دوري أبطال أوروبا: نتائج مباريات الأمس وترتيب الفرق والهدافين", body:"كرة القدم الأوروبية تشهد مباريات مثيرة في دوري الأبطال مع فوز الفرق الكبرى وتألق اللاعبين", lk:"9.1K", cm:"1.8K", sh:"4.2K" },
  { id:10, s:SOURCES[1], t:"٦ س",  tag:"صحة",             title:"دراسة طبية جديدة تكشف عن علاج واعد لأمراض القلب والأوعية الدموية", body:"أطباء ومختبرات بحثية تعلن عن نتائج دراسة علمية مهمة قد تغير بروتوكولات العلاج الصحي", lk:"5.3K", cm:"920", sh:"2.7K" },
  { id:11, s:SOURCES[4], t:"٧ س",  tag:"بيئة",            title:"تقرير أممي: انبعاثات الكربون والاحتباس الحراري يصلان مستويات قياسية جديدة", body:"تحذيرات بيئية من تأثيرات المناخ والتلوث على البيئة البحرية والبرية في المنطقة", lk:"4.1K", cm:"677", sh:"1.9K" },
  { id:12, s:SOURCES[3], t:"٨ س",  tag:"فن",              title:"مهرجان السينما العربية يكشف عن قائمة الأفلام والمسلسلات المشاركة هذا العام", body:"أفلام وأعمال فنية وثقافية وأدبية عربية تتنافس في المهرجان الدولي للسينما والإنتاج", lk:"3.6K", cm:"512", sh:"1.4K" },
];

const SPLASH_DOTS = Array.from({ length: 24 }, (_, i) => ({
  w: ((i * 13) % 3) + 1, l: (i * 37) % 100, t: (i * 53) % 100, o: (((i * 17) % 5) + 1) * 0.04,
}));

function detectGeoFromText(text) {
  if (!text) return null;
  for (const geo of GEO_MAP) {
    if (geo.keywords.some(kw => text.includes(kw))) return geo;
  }
  return null;
}

function buildMapSpots(feed) {
  const spots = {};
  feed.forEach(item => {
    const txt = (item.title||'')+' '+(item.body||'');
    const geo = detectGeoFromText(txt);
    if (!geo) return;
    if (!spots[geo.id]) spots[geo.id] = { ...geo, stories: [], heat: 1 };
    spots[geo.id].stories.push({
      title: item.title, src: item.s?.n||item.source?.name||'—',
      t: item.t||item.time||'', tag: item.tag||item.categories?.[0]||null,
      brk: item.brk||false, lk: item.lk||null, link: item.link||null,
    });
  });
  Object.values(spots).forEach(s => { const c=s.stories.length; s.heat=c>=5?3:c>=2?2:1; });
  return Object.values(spots).sort((a,b) => b.stories.length-a.stories.length);
}

function playBlip() {
  try {
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(900,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450,ctx.currentTime+0.15);
    osc.type='sine';
    gain.gain.setValueAtTime(0.06,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.35);
  } catch(e){}
}

const css = `
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
:root{--bg:#FFF;--f1:#FAFAFA;--g1:#F0F0F0;--g2:#E0E0E0;--t1:#0A0A0A;--t2:#444;--t3:#999;--t4:#C0C0C0;--bk:#000;--rd:#B71C1C;--ft:-apple-system,"SF Arabic","SF Pro Arabic",system-ui,sans-serif}
@keyframes fu{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes hp{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes fi{from{opacity:0}to{opacity:1}}
@keyframes sl{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes cu{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes logoPulse{0%,100%{text-shadow:0 0 30px rgba(255,255,255,.2)}50%{text-shadow:0 0 60px rgba(255,255,255,.5)}}
html,body{background:#000;overflow:hidden;height:100%}
.app{max-width:430px;margin:0 auto;height:100vh;background:var(--bg);font-family:var(--ft);direction:rtl;display:flex;flex-direction:column;overflow:hidden;position:relative}
.sb{display:flex;justify-content:space-between;align-items:center;padding:6px 20px;font-size:12px;font-weight:600;flex-shrink:0}
.hdr{display:flex;justify-content:space-between;align-items:center;padding:2px 20px 10px;flex-shrink:0}
.logo{font-size:24px;font-weight:800;letter-spacing:-.5px}
.hdr-r{display:flex;gap:16px;align-items:center}
.ib{background:none;border:none;cursor:pointer;color:var(--t1);padding:2px;display:flex;align-items:center}
.ib:active{opacity:.35}
.ndot{position:relative}
.ndot::after{content:'';position:absolute;top:1px;right:1px;width:6px;height:6px;background:var(--rd);border-radius:50%;border:1.5px solid var(--bg)}
.spinning{animation:spin .8s linear infinite}
.tabs{display:flex;border-bottom:.5px solid var(--g1);flex-shrink:0}
.tab{flex:1;text-align:center;padding:11px 0;font-size:13px;font-weight:500;color:var(--t4);cursor:pointer;background:none;border:none;font-family:var(--ft);position:relative;transition:color .2s}
.tab.on{color:var(--bk);font-weight:700}
.tab.on::after{content:'';position:absolute;bottom:0;left:20%;right:20%;height:2px;background:var(--bk);border-radius:1px}
.stories{display:flex;gap:14px;padding:14px 20px;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
.stories::-webkit-scrollbar{display:none}
.story{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;flex-shrink:0}
.s-ring{width:48px;height:48px;border-radius:50%;padding:2px;background:var(--bk)}
.s-ring.seen{background:var(--t4)}
.s-av{width:100%;height:100%;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:var(--bk);border:2px solid var(--bg)}
.s-nm{font-size:10px;color:var(--t3);font-weight:500;max-width:50px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.content{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.post{padding:18px 20px;border-bottom:.5px solid var(--g1);animation:fu .4s ease both}
.ph{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.pav{width:34px;height:34px;border-radius:50%;border:1px solid var(--g1);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:var(--t1);background:var(--bg);flex-shrink:0}
.pinfo{flex:1;min-width:0}
.pname{font-size:13px;font-weight:700;color:var(--t1)}
.ptime{font-size:11px;color:var(--t4);margin-right:6px}
.ptag{display:inline-block;font-size:10px;font-weight:600;color:var(--t3);border:1px solid var(--g1);padding:2px 9px;border-radius:3px;margin-bottom:8px;letter-spacing:.3px}
.ptag.brk{color:var(--rd);border-color:rgba(183,28,28,.15)}
.ptitle{font-size:16px;font-weight:700;line-height:1.7;color:var(--t1);margin-bottom:3px}
.pbody{font-size:13px;line-height:1.7;color:var(--t2)}
.pmore-t{color:var(--t4);font-weight:500;cursor:pointer}
.strap{margin-top:12px;border-radius:8px;overflow:hidden;position:relative;height:100px}
.strap-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;background:rgba(255,255,255,.12);border-radius:50%;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.15)}
.strap-dur{position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.5);color:white;font-size:10px;font-weight:500;padding:2px 7px;border-radius:3px}
.pactions{display:flex;align-items:center;margin-top:12px}
.act{display:flex;align-items:center;gap:4px;flex:1;cursor:pointer;color:var(--t4);font-size:11px;background:none;border:none;font-family:var(--ft);transition:color .15s}
.act:active{opacity:.4}
.act.liked{color:var(--rd)}
.act.liked svg{animation:hp .3s ease}
.act.saved{color:var(--bk)}
.act:last-child{flex:0}
.bnav{display:flex;border-top:.5px solid var(--g1);padding:8px 0 20px;background:var(--bg);flex-shrink:0}
.bnav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;background:none;border:none;color:var(--t4);font-family:var(--ft);font-size:10px;font-weight:500;padding:4px 0;transition:color .2s}
.bnav-item.on{color:var(--bk)}
.detail{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--bg);z-index:100;overflow-y:auto;animation:sl .3s cubic-bezier(.25,.46,.45,.94);direction:rtl;font-family:var(--ft)}
.det-hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;position:sticky;top:0;background:var(--bg);z-index:10;border-bottom:.5px solid var(--g1)}
.det-strap{height:180px;border-radius:0}
.det-body{padding:20px 20px 80px}
.det-tag-row{display:flex;gap:8px;align-items:center;margin-bottom:12px}
.det-src{font-size:12px;font-weight:700;border:1px solid var(--g2);border-radius:20px;padding:4px 12px}
.det-meta{display:flex;gap:10px;font-size:12px;color:var(--t3);margin-bottom:16px}
.det-title{font-size:22px;font-weight:800;line-height:1.7;color:var(--bk);margin-bottom:10px}
.det-sub{font-size:14px;color:var(--t2);line-height:1.85;margin-bottom:20px;padding-bottom:20px;border-bottom:.5px solid var(--g1)}
.det-p{font-size:16px;line-height:2;color:var(--t2);margin-bottom:16px}
.srch{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--bg);z-index:100;animation:fi .15s;padding:12px 20px;overflow-y:auto;direction:rtl;font-family:var(--ft)}
.srch-bar{display:flex;align-items:center;gap:10px;border-bottom:.5px solid var(--g1);padding-bottom:12px;margin-bottom:24px}
.srch-in{flex:1;background:none;border:none;font-family:var(--ft);font-size:16px;color:var(--t1);outline:none;direction:rtl}
.srch-in::placeholder{color:var(--t4);font-weight:300}
.srch-c{font-size:14px;font-weight:500;background:none;border:none;cursor:pointer;font-family:var(--ft);color:var(--t3)}
.srch-sec{font-size:11px;font-weight:700;color:var(--t4);letter-spacing:1.5px;margin-bottom:14px;margin-top:4px}
.srch-tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
.srch-tag{padding:8px 16px;border-radius:20px;border:.5px solid var(--g1);font-size:13px;font-weight:500;color:var(--t2);cursor:pointer;font-family:var(--ft);background:none}
.srch-tag:active{background:var(--bk);color:var(--bg);border-color:var(--bk)}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 40px;color:var(--t4);text-align:center;gap:12px}
.empty-title{font-size:17px;font-weight:700;color:var(--t3)}
.empty-sub{font-size:13px;line-height:1.6}
.set-sec{padding:20px;border-bottom:.5px solid var(--g1)}
.set-sec-title{font-size:11px;font-weight:700;color:var(--t4);letter-spacing:1.5px;margin-bottom:14px}
.set-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0}
.set-name{font-size:14px;font-weight:500;color:var(--t1)}
.toggle{width:44px;height:26px;border-radius:13px;background:var(--g2);position:relative;cursor:pointer;border:none;transition:background .3s}
.toggle.on{background:var(--bk)}
.toggle::after{content:'';position:absolute;top:3px;right:3px;width:20px;height:20px;background:white;border-radius:50%;transition:transform .3s;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.toggle.on::after{transform:translateX(-18px)}
.ob{position:fixed;inset:0;max-width:430px;margin:0 auto;background:#000;font-family:var(--ft);direction:rtl;display:flex;flex-direction:column;overflow:hidden;z-index:500}
.ob-prog{display:flex;gap:5px;padding:0 20px;flex-shrink:0}
.ob-prog-dot{flex:1;height:2px;border-radius:1px;background:rgba(255,255,255,.15);transition:background .4s}
.ob-prog-dot.done{background:rgba(255,255,255,.8)}
.ob-title{font-size:26px;font-weight:800;color:#fff;line-height:1.5;margin-bottom:8px}
.ob-sub{font-size:14px;color:rgba(255,255,255,.4);line-height:1.7;margin-bottom:32px}
.ob-btn{background:#fff;color:#000;border:none;border-radius:30px;padding:15px;font-family:var(--ft);font-size:16px;font-weight:700;cursor:pointer;width:100%;transition:opacity .2s}
.ob-btn:active{opacity:.7}
.ob-btn:disabled{opacity:.35}
.ob-btn-sec{background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.5);border-radius:30px;padding:13px;font-family:var(--ft);font-size:14px;font-weight:500;cursor:pointer;width:100%;margin-top:12px}
.ob-chip{padding:11px 18px;border-radius:30px;border:1px solid rgba(255,255,255,.12);font-size:14px;font-weight:500;color:rgba(255,255,255,.7);cursor:pointer;font-family:var(--ft);background:none;transition:all .25s;display:flex;align-items:center;gap:8px}
.ob-chip.sel{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.5);color:#fff}
.ob-src{width:100%;display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:.5px solid rgba(255,255,255,.06);cursor:pointer;background:none;border-left:none;border-right:none;border-top:none;font-family:var(--ft)}
.ob-src:last-child{border-bottom:none}
.ob-src-av{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;flex-shrink:0;transition:all .25s}
.ob-src.sel .ob-src-av{background:rgba(255,255,255,.2)}
.ob-src-name{flex:1;font-size:14px;font-weight:500;color:rgba(255,255,255,.8);text-align:right}
.ob-src-chk{width:22px;height:22px;border-radius:50%;border:1.5px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;transition:all .25s;flex-shrink:0}
.ob-src.sel .ob-src-chk{background:#fff;border-color:#fff}
.topic-bar{display:flex;align-items:center;gap:8px;padding:10px 20px;background:var(--f1);border-bottom:.5px solid var(--g1);overflow-x:auto;scrollbar-width:none}
.topic-bar::-webkit-scrollbar{display:none}
.topic-pill{flex-shrink:0;padding:5px 14px;border-radius:20px;border:1px solid var(--g2);font-size:12px;font-weight:600;color:var(--t3);background:none;white-space:nowrap}
.topic-pill.on{background:var(--bk);color:#fff;border-color:var(--bk)}
`;

const I = {
  heart:    (f) => <svg width="20" height="20" viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth={f?0:1.2}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  bubble:   () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>,
  repeat:   () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
  bookmark: (f) => <svg width="20" height="20" viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth="1.2"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>,
  search:   () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  globe:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  home:     (f) => <svg width="22" height="22" viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth={f?0:1.2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>,
  map:      () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><ellipse cx="12" cy="12" rx="4" ry="10"/></svg>,
  saved:    (f) => <svg width="22" height="22" viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth="1.2"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>,
  user:     () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  close:    () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  more:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>,
  play:     () => <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>,
  back:     () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  share:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>,
  bell:     () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
  link:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  check:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>,
};

// ═══════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════

function ObSplash({ onNext }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), 80); return () => clearTimeout(t); }, []);
  return (
    <div className="ob" style={{ alignItems:'center', justifyContent:'center', textAlign:'center' }}>
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        {SPLASH_DOTS.map((d,i) => <div key={i} style={{ position:'absolute', width:d.w+'px', height:d.w+'px', borderRadius:'50%', background:`rgba(255,255,255,${d.o})`, left:d.l+'%', top:d.t+'%' }}/>)}
      </div>
      <div style={{ fontSize:76, fontWeight:800, color:'#fff', letterSpacing:'-3px', transition:'all 1s cubic-bezier(.175,.885,.32,1.275)', opacity:vis?1:0, transform:vis?'scale(1)':'scale(0.8)', animation:vis?'logoPulse 4s ease infinite':'none' }}>صَدى</div>
      <div style={{ fontSize:15, color:'rgba(255,255,255,.35)', marginTop:14, fontWeight:300, letterSpacing:'.5px', opacity:vis?1:0, transition:'opacity 1s ease .5s' }}>أخبار العالم، بنبضٍ عربي</div>
      <div style={{ marginTop:64, width:'100%', maxWidth:320, padding:'0 32px', opacity:vis?1:0, transform:vis?'translateY(0)':'translateY(24px)', transition:'all .8s ease 1s' }}>
        <button className="ob-btn" onClick={onNext}>ابدأ الآن</button>
        <div style={{ marginTop:20, fontSize:11, color:'rgba(255,255,255,.2)' }}>خطوتان فقط لتخصيص تجربتك</div>
      </div>
    </div>
  );
}

function ObSources({ sel, toggle, onNext }) {
  return (
    <div className="ob" style={{ padding:'44px 0 0' }}>
      <div className="ob-prog" style={{ marginBottom:32 }}>{[0,1,2].map(i=><div key={i} className={`ob-prog-dot ${i===0?'done':''}`}/>)}</div>
      <div style={{ padding:'0 24px', flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div className="ob-title">اختر مصادرك</div>
        <div className="ob-sub">اختر ٣ مصادر أو أكثر — تظهر أخبارها أولاً في تغذيتك</div>
        <div style={{ flex:1, overflowY:'auto', marginBottom:16 }}>
          {SOURCES.map(s => { const on=sel.has(s.id); return (
            <button key={s.id} className={`ob-src ${on?'sel':''}`} onClick={() => toggle(s.id)}>
              <div className="ob-src-chk">{on && I.check()}</div>
              <div className="ob-src-name">{s.n}</div>
              <div className="ob-src-av">{s.i}</div>
            </button>
          );})}
        </div>
        <div style={{ padding:'12px 0 32px', flexShrink:0 }}>
          <button className="ob-btn" onClick={onNext} disabled={sel.size<3}>التالي ({sel.size} مختار)</button>
        </div>
      </div>
    </div>
  );
}

function ObTopics({ sel, toggle, onNext }) {
  return (
    <div className="ob" style={{ padding:'44px 24px 0' }}>
      <div className="ob-prog" style={{ padding:0, marginBottom:32 }}>{[0,1,2].map(i=><div key={i} className={`ob-prog-dot ${i<=1?'done':''}`}/>)}</div>
      <div className="ob-title">ما الذي يهمك؟</div>
      <div className="ob-sub">اختياراتك تُشكّل تبويب "مهم" في تغذيتك اليومية</div>
      <div style={{ flex:1, overflowY:'auto', marginBottom:16 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingBottom:20 }}>
          {TOPICS.map(t => (
            <button key={t.id} className={`ob-chip ${sel.has(t.id)?'sel':''}`} onClick={() => toggle(t.id)}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding:'0 0 32px', flexShrink:0 }}>
        <button className="ob-btn" onClick={onNext}>{sel.size>0?`التالي (${sel.size} مجالات)`:'التالي'}</button>
        <button className="ob-btn-sec" onClick={onNext}>تخطّ</button>
      </div>
    </div>
  );
}

function ObRegions({ sel, toggle, onNext }) {
  return (
    <div className="ob" style={{ padding:'44px 24px 0' }}>
      <div className="ob-prog" style={{ padding:0, marginBottom:32 }}>{[0,1,2].map(i=><div key={i} className="ob-prog-dot done"/>)}</div>
      <div className="ob-title">من أين تتابع؟</div>
      <div className="ob-sub">نرتّب الأخبار الإقليمية حسب اهتمامك الجغرافي</div>
      <div style={{ flex:1, overflowY:'auto', marginBottom:16 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingBottom:20 }}>
          {REGIONS.map(r => (
            <button key={r.id} className={`ob-chip ${sel.has(r.id)?'sel':''}`} onClick={() => toggle(r.id)}>
              <span>{r.flag}</span>{r.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding:'0 0 32px', flexShrink:0 }}>
        <button className="ob-btn" onClick={onNext}>إنشاء غرفتي الإخبارية</button>
        <button className="ob-btn-sec" onClick={onNext}>تخطّ</button>
      </div>
    </div>
  );
}

function ObReady({ selSources, selTopics, onDone }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t=setTimeout(()=>setVis(true),100); return ()=>clearTimeout(t); }, []);
  const topicLabels = [...selTopics].map(id=>TOPICS.find(t=>t.id===id)?.label).filter(Boolean).slice(0,3);
  return (
    <div className="ob" style={{ alignItems:'center', justifyContent:'center', textAlign:'center', padding:'0 32px' }}>
      <div style={{ opacity:vis?1:0, transform:vis?'scale(1)':'scale(0.9)', transition:'all .8s cubic-bezier(.175,.885,.32,1.275)' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>✓</div>
        <div style={{ fontSize:28, fontWeight:800, color:'#fff', marginBottom:10 }}>غرفتك جاهزة</div>
        <div style={{ fontSize:14, color:'rgba(255,255,255,.35)', lineHeight:1.8, marginBottom:10 }}>{selSources.size} مصدر مختار</div>
        {topicLabels.length>0 && <div style={{ fontSize:13, color:'rgba(255,255,255,.25)', marginBottom:48 }}>يتابع: {topicLabels.join(' · ')}{selTopics.size>3?` +${selTopics.size-3}`:''}</div>}
        <button className="ob-btn" onClick={onDone} style={{ maxWidth:300 }}>ادخل إلى صَدى</button>
      </div>
    </div>
  );
}

function Onboarding({ onDone }) {
  const [step, setStep]             = useState(0);
  const [selSrcs, setSelSrcs]       = useState(() => new Set(['aljazeera','alarabiya','bbc']));
  const [selTopics, setSelTopics]   = useState(() => new Set());
  const [selRegions, setSelRegions] = useState(() => new Set(['gulf']));
  const toggleSrc = (id) => setSelSrcs(prev => {
    const n = new Set(prev); if (n.has(id) && n.size <= 3) return n;
    n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const finish = () => {
    const prefs = { topics:[...selTopics], regions:[...selRegions], sources:[...selSrcs] };
    try { localStorage.setItem('sada-ob-done','1'); localStorage.setItem('sada-prefs',JSON.stringify(prefs)); } catch {}
    onDone(prefs);
  };
  return (
    <>
      <style>{css}</style>
      {step===0 && <ObSplash onNext={()=>setStep(1)}/>}
      {step===1 && <ObSources sel={selSrcs} toggle={toggleSrc} onNext={()=>setStep(2)}/>}
      {step===2 && <ObTopics sel={selTopics} toggle={id=>setSelTopics(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;})} onNext={()=>setStep(3)}/>}
      {step===3 && <ObRegions sel={selRegions} toggle={id=>setSelRegions(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;})} onNext={()=>setStep(4)}/>}
      {step===4 && <ObReady selSources={selSrcs} selTopics={selTopics} onDone={finish}/>}
    </>
  );
}

// ═══════════════════════════════════════════
// NEWS MAP — MapLibre GL JS
// WebGL, flyTo camera, pulsing markers, free
// ═══════════════════════════════════════════

const CITY_TIMES = [
  { city:'الرياض', tz:'Asia/Riyadh' },
  { city:'لندن',   tz:'Europe/London' },
  { city:'نيويورك',tz:'America/New_York' },
  { city:'طوكيو',  tz:'Asia/Tokyo' },
];

function NewsMap({ onClose, liveFeed=[] }) {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const [sel, setSel]   = useState(null);
  const [time, setTime] = useState(new Date());
  const [mapReady, setMapReady] = useState(false);
  const spots = useMemo(() => buildMapSpots(liveFeed.length>0?liveFeed:FEED), [liveFeed.length]);
  const spotsRef = useRef(spots);
  useEffect(() => { spotsRef.current = spots; }, [spots]);
  const geojsonData = useMemo(() => ({
    type: 'FeatureCollection',
    features: spots.map(spot => ({
      type: 'Feature',
      properties: { weight: spot.stories.length, id: spot.id },
      geometry: { type: 'Point', coordinates: [spot.lng, spot.lat] },
    })),
  }), [spots]);

  const fmt = (tz) => {
    try { return new Intl.DateTimeFormat('ar',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(time); }
    catch { return '--:--'; }
  };

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (!mapContainerRef.current || mapRef.current) return;
      const ML = window.maplibregl;

      const map = new ML.Map({
        container: mapContainerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [38, 28],
        zoom: 3.2,
        pitch: 30,
        bearing: 0,
        attributionControl: false,
        maxPitch: 65,
      });

      mapRef.current = map;

      map.on('load', () => {
        setMapReady(true);

        // Heatmap GeoJSON source
        map.addSource('news-heat', { type: 'geojson', data: geojsonData });

        // Snap Map-style heatmap layer
        map.addLayer({
          id: 'news-heatmap',
          type: 'heatmap',
          source: 'news-heat',
          paint: {
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': ['interpolate',['linear'],['zoom'], 0,0.6, 5,1.2, 9,2.0],
            'heatmap-color': [
              'interpolate',['linear'],['heatmap-density'],
              0,   'rgba(0,0,0,0)',
              0.1, 'rgba(30,60,180,0.4)',
              0.25,'rgba(0,180,220,0.55)',
              0.4, 'rgba(0,220,120,0.6)',
              0.55,'rgba(180,220,0,0.7)',
              0.7, 'rgba(255,180,0,0.8)',
              0.85,'rgba(255,100,0,0.85)',
              1.0, 'rgba(230,40,30,0.9)',
            ],
            'heatmap-radius': ['interpolate',['linear'],['zoom'], 0,30, 3,45, 5,65, 8,90, 12,120],
            'heatmap-opacity': 0.85,
          },
        });

        // Invisible circles for pointer cursor feedback
        map.addLayer({
          id: 'news-heat-circles',
          type: 'circle',
          source: 'news-heat',
          paint: {
            'circle-radius': ['interpolate',['linear'],['zoom'], 0,4, 5,8, 10,14],
            'circle-color': 'rgba(255,255,255,0)',
            'circle-stroke-width': 0,
          },
        });
        map.on('mouseenter','news-heat-circles', () => { map.getCanvas().style.cursor='pointer'; });
        map.on('mouseleave','news-heat-circles', () => { map.getCanvas().style.cursor=''; });

        // Click → find nearest spot → open drawer
        map.on('click', (e) => {
          const { lng: cLng, lat: cLat } = e.lngLat;
          const zoom = map.getZoom();
          const maxDist = zoom < 4 ? 5 : zoom < 6 ? 3 : zoom < 8 ? 1.5 : 0.5;
          let nearest = null, minDist = Infinity;
          spotsRef.current.forEach(spot => {
            const d = Math.sqrt(Math.pow(spot.lng-cLng,2)+Math.pow(spot.lat-cLat,2));
            if (d < minDist && d < maxDist) { minDist = d; nearest = spot; }
          });
          if (nearest) {
            playBlip();
            setSel(nearest);
            map.flyTo({
              center: [nearest.lng, nearest.lat-1.5], zoom:5.8, pitch:50,
              bearing: (Math.random()-0.5)*20, duration:1600,
              easing: t => t<0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
            });
          }
        });
      });

      return map;
    };

    if (window.maplibregl) {
      initMap();
    } else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      setMapReady(false);
    };
  }, []);

  // Update heatmap data when feed changes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('news-heat');
    if (source) source.setData(geojsonData);
  }, [mapReady, geojsonData]);

  // Pulsing animation — subtle breathing like Snap Map
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    let frame, last = 0;
    const animate = (now) => {
      if (now - last > 33) {
        last = now;
        const t = 0.5 + 0.5 * Math.sin((now / 2500) * Math.PI * 2);
        try {
          map.setPaintProperty('news-heatmap','heatmap-opacity', 0.7 + 0.15 * t);
          map.setPaintProperty('news-heatmap','heatmap-intensity',
            ['interpolate',['linear'],['zoom'], 0, 0.6*(0.85+0.15*t), 5, 1.2*(0.85+0.15*t), 9, 2.0*(0.85+0.15*t)]);
        } catch(e) {}
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [mapReady]);

  const handleClose = () => {
    setSel(null);
    if (mapRef.current) {
      mapRef.current.flyTo({ center:[38,28], zoom:3.2, pitch:30, bearing:0, duration:1000 });
    }
    onClose();
  };

  const totalStories = spots.reduce((a,s)=>a+s.stories.length,0);

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:50, display:'flex', flexDirection:'column', background:'#04080f', height:'100dvh' }}>

      {/* Gradient overlay header */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, zIndex:100,
        padding:'max(44px, env(safe-area-inset-top, 44px)) 16px 16px',
        background:'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
        pointerEvents:'none',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', pointerEvents:'auto' }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:'#fff', direction:'rtl' }}>خريطة الأخبار</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.45)', direction:'rtl', marginTop:2 }}>
              {spots.length} منطقة · {totalStories} خبر مباشر
            </div>
          </div>
          <button onClick={handleClose} style={{
            background:'rgba(0,0,0,0.55)', backdropFilter:'blur(12px)',
            border:'1px solid rgba(255,255,255,.18)', cursor:'pointer',
            color:'#fff', padding:10, borderRadius:'50%', display:'flex',
            pointerEvents:'auto',
          }}>{I.close()}</button>
        </div>

        {/* World clocks */}
        <div style={{ display:'flex', gap:6, marginTop:12, justifyContent:'center', pointerEvents:'auto' }}>
          {CITY_TIMES.map((c,i) => (
            <div key={i} style={{
              background:'rgba(0,0,0,0.55)', backdropFilter:'blur(12px)',
              borderRadius:10, padding:'5px 8px', border:'1px solid rgba(255,255,255,.12)',
              textAlign:'center',
            }}>
              <div style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,.95)', fontVariantNumeric:'tabular-nums' }}>{fmt(c.tz)}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.35)', marginTop:1 }}>{c.city}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MapLibre GL container */}
      <div ref={mapContainerRef} style={{ flex:1, width:'100%' }}/>

      {/* Loading spinner */}
      {!mapReady && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#04080f', zIndex:99 }}>
          <div style={{ textAlign:'center', color:'rgba(255,255,255,.4)', fontSize:13 }}>
            <div style={{ width:32, height:32, border:'2px solid rgba(255,255,255,.12)', borderTopColor:'#E53935', borderRadius:'50%', margin:'0 auto 12px', animation:'spin .8s linear infinite' }}/>
            جاري تحميل الخريطة…
          </div>
        </div>
      )}

      {/* Story drawer */}
      {sel && (
        <div onClick={()=>setSel(null)} style={{ position:'absolute', inset:0, zIndex:200 }}>
          <div onClick={e=>e.stopPropagation()} style={{
            position:'absolute', bottom:0, left:0, right:0,
            background:'#fff', borderRadius:'20px 20px 0 0',
            maxHeight:'55%', display:'flex', flexDirection:'column',
            boxShadow:'0 -8px 40px rgba(0,0,0,.5)',
            animation:'cu .3s cubic-bezier(.32,.72,.24,1)',
            direction:'rtl', fontFamily:'var(--ft)',
          }}>
            <div style={{ width:36, height:4, background:'#E0E0E0', borderRadius:2, margin:'10px auto 0', flexShrink:0 }}/>
            <div style={{ padding:'12px 20px 10px', borderBottom:'.5px solid #F0F0F0', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <span style={{ fontSize:18, fontWeight:800, color:'#0A0A0A' }}>{sel.city}</span>
                <span style={{ fontSize:13, color:'#C0C0C0' }}>· {sel.country}</span>
              </div>
              <div style={{ fontSize:11, color:'#C0C0C0' }}>{sel.stories.length} {sel.stories.length>1?'أخبار':'خبر'} الآن</div>
            </div>
            <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
              {sel.stories.map((s,i) => (
                <div key={i} onClick={()=>s.link&&s.link!=='#'&&window.open(s.link,'_blank')}
                  style={{ padding:'14px 20px', borderBottom:i<sel.stories.length-1?'.5px solid #F0F0F0':'none', cursor:s.link?'pointer':'default' }}>
                  {s.tag && <div style={{ display:'inline-block', fontSize:10, fontWeight:600, color:s.brk||s.tag==='عاجل'?'#B71C1C':'#999', border:`1px solid ${s.brk||s.tag==='عاجل'?'rgba(183,28,28,.15)':'#F0F0F0'}`, padding:'1px 8px', borderRadius:3, marginBottom:6 }}>{s.tag}</div>}
                  <div style={{ fontSize:15, fontWeight:700, lineHeight:1.7, color:'#0A0A0A', marginBottom:4 }}>{s.title}</div>
                  <div style={{ fontSize:11, color:'#C0C0C0' }}>{s.src} · {s.t}{s.lk?` · ${s.lk} تفاعل`:''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// NEWSROOM COMPONENTS
// ═══════════════════════════════════════════

function Post({ item, delay, onOpen, onSave, isSaved }) {
  const [liked, setLiked] = useState(false);
  const [exp, setExp]     = useState(false);
  const trunc = item.body && item.body.length>100 && !exp;
  return (
    <div className="post" style={{ animationDelay:`${delay}s` }}>
      <div className="ph">
        <div className="pav">{item.s.i}</div>
        <div className="pinfo"><span className="pname">{item.s.n}</span><span className="ptime">{item.t}</span></div>
        <button className="ib" style={{ color:'var(--t4)' }}>{I.more()}</button>
      </div>
      {item.tag && <div className={`ptag ${item.brk?'brk':''}`}>{item.tag}</div>}
      <div className="ptitle" onClick={()=>onOpen(item)} style={{ cursor:'pointer' }}>{item.title}</div>
      {item.body && !trunc && <div className="pbody">{item.body}</div>}
      {trunc && <div className="pbody">{item.body.slice(0,100)}… <span className="pmore-t" onClick={()=>setExp(true)}>المزيد</span></div>}
      {(item.bg||item.realImg) && (
        <div className="strap" style={item.realImg?{}:{background:item.bg}} onClick={()=>onOpen(item)}>
          {item.realImg && <img src={item.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',display:'block',filter:'saturate(1.3) contrast(1.05)' }} onError={e=>{e.target.style.display='none';}}/>}
          {item.vid && <><div className="strap-play">{I.play()}</div><div className="strap-dur">٢:٣٤</div></>}
        </div>
      )}
      <div className="pactions">
        <button className={`act ${liked?'liked':''}`} onClick={()=>setLiked(!liked)}>{I.heart(liked)} {item.lk}</button>
        <button className="act">{I.bubble()} {item.cm}</button>
        <button className="act">{I.repeat()} {item.sh}</button>
        <button className={`act ${isSaved?'saved':''}`} onClick={()=>onSave(item.id)}>{I.bookmark(isSaved)}</button>
      </div>
    </div>
  );
}

function ArticleDetail({ article, onClose, onSave, isSaved }) {
  const [fullText, setFullText] = useState(null);
  const [fetching, setFetching] = useState(false);
  useEffect(() => {
    if (!article.link||article.link==='#') return;
    setFetching(true);
    fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(article.link)}`)
      .then(r=>r.json())
      .then(data=>{
        const doc=new DOMParser().parseFromString(data.contents||'','text/html');
        const selectors=['article','.article-body','.article-content','.story-body','.content-body','.post-content','.entry-content'];
        let text='';
        for(const s of selectors){const el=doc.querySelector(s);if(el){text=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();if(text.length>200)break;}}
        if(text.length<200){text=Array.from(doc.querySelectorAll('p')).map(p=>p.textContent.trim()).filter(t=>t.length>40&&!t.includes('cookie')&&!t.match(/https?:\/\//)).join('\n\n');}
        if(text.length>100) setFullText(text.slice(0,4000));
      }).catch(()=>{}).finally(()=>setFetching(false));
  }, [article.id]);
  const paragraphs = fullText ? fullText.split('\n').filter(p=>p.trim().length>20) : null;
  return (
    <div className="detail">
      <div className="det-hdr">
        <button className="ib" onClick={onClose}>{I.back()}</button>
        <div style={{ display:'flex',gap:14 }}>
          <button className="ib" style={isSaved?{color:'var(--bk)'}:{}} onClick={()=>onSave(article.id)}>{I.bookmark(isSaved)}</button>
          <button className="ib">{I.share()}</button>
        </div>
      </div>
      {(article.bg||article.realImg) && (
        <div className="strap det-strap" style={article.realImg?{}:{background:article.bg,borderRadius:0}}>
          {article.realImg&&<img src={article.realImg} alt="" style={{ width:'100%',height:'100%',objectFit:'cover',display:'block',filter:'saturate(1.3)' }} onError={e=>{e.target.parentElement.style.display='none';}}/>}
        </div>
      )}
      <div className="det-body">
        <div className="det-tag-row">
          <span className="det-src">{article.s.n}</span>
          {article.tag&&<div className={`ptag ${article.brk?'brk':''}`} style={{ margin:0 }}>{article.tag}</div>}
        </div>
        <div className="det-meta"><span>{article.t}</span>{article.lk&&<span>{article.lk} تفاعل</span>}</div>
        <div className="det-title">{article.title}</div>
        {article.body&&<div className="det-sub">{article.body}</div>}
        {fetching&&<div style={{ color:'var(--t4)',fontSize:13,padding:'16px 0',textAlign:'center' }}>جاري تحميل المقال…</div>}
        {paragraphs&&paragraphs.map((p,i)=><p key={i} className="det-p">{p}</p>)}
        {!fetching&&!paragraphs&&<p className="det-p" style={{ color:'var(--t3)',fontStyle:'italic' }}>في تطور لافت يعكس التحولات المتسارعة في المنطقة، شهد هذا الحدث اهتماماً واسعاً من المراقبين والمحللين الدوليين.</p>}
        {article.link&&article.link!=='#'&&(
          <div style={{ marginTop:20,paddingTop:14,borderTop:'.5px solid var(--g1)' }}>
            <a href={article.link} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:5,color:'var(--t3)',fontSize:12,fontWeight:600,fontFamily:'var(--ft)',textDecoration:'none' }}>
              {I.link()} اقرأ من {article.s.n}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchView({ onClose, feed=[], onOpen }) {
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

function BookmarksView({ savedIds, onOpen, allFeed }) {
  const saved=allFeed.filter(f=>savedIds.has(f.id));
  if(saved.length===0) return (
    <div className="empty">
      <div style={{ opacity:.3 }}>{I.bookmark(false)}</div>
      <div className="empty-title">لا توجد محفوظات</div>
      <div className="empty-sub">اضغط على أيقونة الحفظ في أي خبر لإضافته هنا</div>
    </div>
  );
  return saved.map((item,i)=>(
    <div key={item.id} className="post" style={{ animationDelay:`${i*.05}s`,cursor:'pointer' }} onClick={()=>onOpen(item)}>
      <div className="ph"><div className="pav">{item.s.i}</div><div className="pinfo"><span className="pname">{item.s.n}</span><span className="ptime">{item.t}</span></div></div>
      {item.tag&&<div className={`ptag ${item.brk?'brk':''}`}>{item.tag}</div>}
      <div className="ptitle">{item.title}</div>
      {item.body&&<div className="pbody" style={{ WebkitLineClamp:2,display:'-webkit-box',WebkitBoxOrient:'vertical',overflow:'hidden' }}>{item.body}</div>}
    </div>
  ));
}

function SettingsView({ sources, toggleSource, userPrefs={}, onResetOnboarding }) {
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
        <div className="set-row"><span className="set-name">الوضع الداكن</span><button className="toggle"/></div>
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
        <div style={{ fontSize:11,color:'var(--t4)',marginBottom:4 }}>صَدى v2.4</div>
        <div style={{ fontSize:11,color:'var(--t4)' }}>أخبار العالم في مكانٍ واحد</div>
      </div>
    </>
  );
}

export default function Sada() {
  const [obDone, setObDone] = useState(() => { try { return localStorage.getItem('sada-ob-done')==='1'; } catch { return false; } });
  const [userPrefs, setUserPrefs] = useState(() => { try { return JSON.parse(localStorage.getItem('sada-prefs')||'{}'); } catch { return {}; } });
  const [nav, setNav]           = useState('home');
  const [feedTab, setFeedTab]   = useState('now');
  const [article, setArticle]   = useState(null);
  const [srch, setSrch]         = useState(false);
  const [sources, setSources]   = useState({});
  const [newCount, setNewCount] = useState(0);
  const prevLen                 = useRef(0);
  const [savedIds, setSavedIds] = useState(() => { try { const s=localStorage.getItem('sada-bookmarks'); return s?new Set(JSON.parse(s)):new Set(); } catch { return new Set(); } });
  const toggleSave = useCallback(id => { setSavedIds(prev => { const next=new Set(prev); next.has(id)?next.delete(id):next.add(id); try { localStorage.setItem('sada-bookmarks',JSON.stringify([...next])); } catch {} return next; }); }, []);
  useEffect(() => { try { const s=localStorage.getItem('sada-sources'); if(s) setSources(JSON.parse(s)); } catch {} }, []);
  const toggleSource = useCallback(i => { setSources(prev => { const next={...prev,[i]:prev[i]===false?true:false}; try { localStorage.setItem('sada-sources',JSON.stringify(next)); } catch {} return next; }); }, []);
  const { feed:liveFeed, loading, isLive, refresh } = useNews();
  useEffect(() => { const t=setInterval(()=>{ if(refresh) refresh(); },10000); return ()=>clearInterval(t); }, [refresh]);
  useEffect(() => { if(liveFeed.length>prevLen.current && prevLen.current>0){ setNewCount(liveFeed.length-prevLen.current); setTimeout(()=>setNewCount(0),4000); } prevLen.current=liveFeed.length; }, [liveFeed.length]);

  const allFeed = liveFeed.length>0 ? liveFeed.map((item,i) => ({
    id: item.id||`i-${i}`, s: { n:item.source?.name||'مصدر', i:item.source?.initial||'؟' },
    t: item.time||'الآن', title: item.title,
    body: (item.body||'').replace(/https?:\/\/\S+/g,'').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim().slice(0,200)||null,
    bg: item.image?null:(i%3===0?'linear-gradient(135deg,#1a1a2e,#0f3460)':i%3===1?'linear-gradient(135deg,#2d3436,#636e72)':null),
    realImg: item.image||null, link: item.link, tag: item.categories?.[0]||null,
    brk: item.categories?.[0]==='عاجل'||!!item.title?.includes('عاجل'),
    lk: `${Math.floor(((i*7+3)%15)+1)}.${(i*3)%9}K`, cm: `${((i*11+5)%3000)}`, sh: `${Math.floor(((i*5+2)%6)+1)}.${(i*7)%9}K`,
  })) : FEED;

  const sourcedFeed = allFeed.filter(item => { const idx=SOURCES.findIndex(s=>s.n===item.s?.n); return idx===-1||sources[idx]!==false; });
  const CONTEXT_TAGS = ['تحليل','رأي','تقرير','حصري','ملف'];
  const userTopics = userPrefs.topics||[];

  const displayFeed = useMemo(() => {
    if(feedTab==='now'){ const brk=sourcedFeed.filter(item=>item.brk||item.tag==='عاجل'||item.title?.includes('عاجل')); return brk.length>0?brk:sourcedFeed.slice(0,12); }
    if(feedTab==='context'){ const ctx=sourcedFeed.filter(item=>item.tag&&CONTEXT_TAGS.includes(item.tag)); return ctx.length>3?ctx:sourcedFeed.filter((_,i)=>i%2===1); }
    if(userTopics.length>0){ const scored=sourcedFeed.map(item=>({...item,_score:scoreByTopics(item,userTopics)})).sort((a,b)=>b._score-a._score); return scored.some(i=>i._score>0)?scored:sourcedFeed; }
    return [...sourcedFeed].sort((a,b)=>{ const pk=v=>{ if(!v) return 0; const n=parseFloat(v); return v.includes('K')?n*1000:n; }; return pk(b.lk)-pk(a.lk); });
  }, [feedTab, sourcedFeed, userTopics.join(',')]);

  const navItems = [
    { id:'home', label:'الرئيسية', icon:f=>I.home(f) },
    { id:'map',  label:'خريطة',    icon:f=>I.map(f)  },
    { id:'saved',label:'المحفوظات',icon:f=>I.saved(f)},
    { id:'settings',label:'الإعدادات',icon:()=>I.user()},
  ];
  const resetOnboarding = () => { try { localStorage.removeItem('sada-ob-done'); localStorage.removeItem('sada-prefs'); } catch {} setObDone(false); setUserPrefs({}); };
  if(!obDone) return <Onboarding onDone={(prefs)=>{ setUserPrefs(prefs); setObDone(true); }}/>;

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="sb">
          <span>٩:٤١</span>
          <div style={{ display:'flex',gap:6,alignItems:'center' }}>
            <svg width="16" height="12" viewBox="0 0 16 12"><rect x="0" y="6" width="3" height="6" rx="1" fill="#111"/><rect x="4.5" y="4" width="3" height="8" rx="1" fill="#111"/><rect x="9" y="2" width="3" height="10" rx="1" fill="#111"/><rect x="13.5" y="0" width="3" height="12" rx="1" fill="#111" opacity=".3"/></svg>
            <svg width="25" height="12" viewBox="0 0 25 12"><rect x="0" y="1" width="22" height="10" rx="2" stroke="#111" strokeWidth="1" fill="none"/><rect x="23" y="4" width="2" height="4" rx="1" fill="#111" opacity=".4"/><rect x="1.5" y="2.5" width="16" height="7" rx="1" fill="#111"/></svg>
          </div>
        </div>
        <div className="hdr">
          <div className="logo">صَدى</div>
          <div className="hdr-r">
            <button className="ib" onClick={()=>setSrch(true)}>{I.search()}</button>
            <button className={`ib ${loading?'spinning':''}`} onClick={refresh}>{I.globe()}</button>
            <button className="ib ndot">{I.bell()}</button>
          </div>
        </div>
        {nav==='home'&&(<div className="tabs">{[{id:'now',l:'هنا والآن'},{id:'important',l:'مهم'},{id:'context',l:'سياق'}].map(t=>(<button key={t.id} className={`tab ${feedTab===t.id?'on':''}`} onClick={()=>setFeedTab(t.id)}>{t.l}</button>))}</div>)}
        {nav!=='home'&&(<div style={{ padding:'0 20px 12px',fontSize:20,fontWeight:800,color:'var(--bk)',borderBottom:'.5px solid var(--g1)' }}>{nav==='saved'&&'المحفوظات'}{nav==='settings'&&'الإعدادات'}{nav==='map'&&'خريطة الأخبار'}</div>)}
        <div className="content">
          {nav==='home'&&(<>
            {newCount>0&&(<div onClick={()=>setNewCount(0)} style={{ position:'sticky',top:0,zIndex:50,background:'#0A0A0A',color:'#fff',fontSize:12,fontWeight:700,textAlign:'center',padding:'9px',cursor:'pointer' }}>↑ {newCount} خبر جديد</div>)}
            {isLive&&(<div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 0',fontSize:11,color:'var(--t4)' }}><div style={{ width:5,height:5,borderRadius:'50%',background:'#4CAF50' }}/>أخبار مباشرة · {allFeed.length} خبر</div>)}
            <div className="stories">{SOURCES.map((s,i)=>(<div className="story" key={i} onClick={()=>{setSources(prev=>({...prev,[i]:prev[i]===true?undefined:true}));setFeedTab('important');}}><div className={`s-ring ${sources[i]===true?'':'seen'}`}><div className="s-av">{s.i}</div></div><div className="s-nm">{s.n}</div></div>))}</div>
            {feedTab==='important'&&userTopics.length>0&&(<div className="topic-bar"><span style={{ fontSize:11,color:'var(--t4)',fontWeight:700,whiteSpace:'nowrap',flexShrink:0 }}>يُصفَّح حسب:</span>{userTopics.map(id=>{ const t=TOPICS.find(x=>x.id===id); return t?<span key={id} className="topic-pill on">{t.icon} {t.label}</span>:null; })}</div>)}
            {feedTab==='important'&&userTopics.length===0&&(<div style={{ padding:'10px 20px',background:'var(--f1)',fontSize:12,color:'var(--t3)',borderBottom:'.5px solid var(--g1)',display:'flex',justifyContent:'space-between',alignItems:'center' }}><span>لم تختر اهتمامات بعد — يُرتَّب حسب التفاعل</span><button onClick={resetOnboarding} style={{ fontSize:11,fontWeight:700,color:'var(--bk)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--ft)' }}>اضبط ▸</button></div>)}
            {feedTab==='context'&&(<div style={{ padding:'10px 20px',background:'var(--f1)',fontSize:12,color:'var(--t3)',borderBottom:'.5px solid var(--g1)' }}>تحليلات ومقالات رأي وتقارير معمّقة</div>)}
            {loading&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>جاري تحميل الأخبار…</div>}
            {!loading&&displayFeed.length===0&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>لا توجد أخبار في هذا التصنيف</div>}
            {!loading&&displayFeed.map((item,i)=>(<Post key={item.id} item={item} delay={i*.04} onOpen={setArticle} onSave={toggleSave} isSaved={savedIds.has(item.id)}/>))}
            <div style={{ height:20 }}/>
          </>)}
          {nav==='map'     && <NewsMap onClose={()=>setNav('home')} liveFeed={allFeed}/>}
          {nav==='saved'   && <BookmarksView savedIds={savedIds} onOpen={setArticle} allFeed={allFeed}/>}
          {nav==='settings'&& <SettingsView sources={sources} toggleSource={toggleSource} userPrefs={userPrefs} onResetOnboarding={resetOnboarding}/>}
        </div>
        <div className="bnav">{navItems.map(item=>(<button key={item.id} className={`bnav-item ${nav===item.id?'on':''}`} onClick={()=>setNav(item.id)}>{item.icon(nav===item.id)}<span>{item.label}</span></button>))}</div>
        {article&&<ArticleDetail article={article} onClose={()=>setArticle(null)} onSave={toggleSave} isSaved={savedIds.has(article.id)}/>}
        {srch   &&<SearchView onClose={()=>setSrch(false)} feed={allFeed} onOpen={setArticle}/>}
      </div>
    </>
  );
}
