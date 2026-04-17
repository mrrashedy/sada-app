// Client-side source registry. Mirrors the server SOURCES in functions/api/feeds.js.
// `photoOnly: true` → source is only used by the Photo Grid (NOT the main feed).
// Used for logo lookups in post headers, the stories strip, and the photo grid.
//
// ⚠️  KEEP IN SYNC WITH functions/api/feeds.js → SOURCES const.
// Adding a source to ONLY the backend file means items will be fetched but
// the source pill won't render in the UI strip and items will fall back to
// generic styling. The runtime drift detector in src/lib/useNews.js logs a
// console.warn for any backend source missing from this file — check the
// browser console after adding sources.

export const SOURCES = [
  { n:"الجزيرة",       i:"ج",  id:"aljazeera",     domain:"aljazeera.net",        logo:"/logos/aljazeera.png" },
  { n:"الجزيرة عاجل", i:"عاجل",id:"aja_breaking",  domain:"aljazeera.net",        hideFromStrip:true },
  { n:"BBC عربي",      i:"B",  id:"bbc",           domain:"bbc.com"               },
  { n:"سكاي نيوز",    i:"S",  id:"skynews",       domain:"skynewsarabia.com"     },
  { n:"فرانس ٢٤",     i:"F",  id:"france24",      domain:"france24.com"          },
  { n:"دويتشه فيله",  i:"D",  id:"dw",            domain:"dw.com"                },
  { n:"CNN عربية",     i:"C",  id:"cnn_ar",        domain:"arabic.cnn.com"        },
  { n:"CNN اقتصاد",    i:"C$", id:"cnn_biz_ar",    domain:"cnnbusinessarabic.com",hideFromStrip:true },
  { n:"مونت كارلو",    i:"MC", id:"mc_doualiya",   domain:"mc-doualiya.com"       },
  { n:"رويترز",        i:"R",  id:"reuters_ar",    domain:"reuters.com"           },
  { n:"إندبندنت عربية",i:"إ",  id:"independent_ar",domain:"independentarabia.com" },
  { n:"الشرق الأوسط", i:"ش",  id:"aawsat",        domain:"aawsat.com"            },
  { n:"الحرة",         i:"ح",  id:"alhurra",       domain:"alhurra.com"           },
  { n:"روسيا اليوم",    i:"RT", id:"rt_ar",         domain:"arabic.rt.com"         },
  { n:"العربية",       i:"ع",  id:"alarabiya",     domain:"alarabiya.net"         },
  { n:"العربية عاجل",  i:"عاع",id:"alarabiya_brk", domain:"x.com",                hideFromStrip:true },
  { n:"العربي عاجل",   i:"عت", id:"alaraby_tv_brk",domain:"t.me",                 hideFromStrip:true },
  { n:"الشرق الإخبارية",i:"شر", id:"asharq_news",   domain:"asharq.com"            },
  { n:"تميم بن حمد",   i:"تم", id:"tamim_qatar",   domain:"x.com",                hideFromStrip:true },
  { n:"أخبار Google عالمي", i:"GN", id:"gnews_world", domain:"news.google.com"      },
  { n:"أخبار Google تقنية", i:"GT", id:"gnews_tech",  domain:"news.google.com"      },
  { n:"أخبار Google صحة",   i:"GH", id:"gnews_health",domain:"news.google.com"      },
  { n:"أخبار Google علوم",  i:"GS", id:"gnews_science",domain:"news.google.com"     },
  { n:"العربي الجديد", i:"ع",  id:"alaraby",       domain:"newarab.com"           },
  { n:"المصري اليوم",  i:"م",  id:"almasry",       domain:"almasryalyoum.com"     },
  { n:"بوابة الشروق",  i:"شو", id:"shorouk_eg",    domain:"shorouknews.com"       },
  { n:"مصراوي",        i:"مص", id:"masrawy",       domain:"masrawy.com"           },
  { n:"الأهرام EN",    i:"AH", id:"ahram_en",      domain:"english.ahram.org.eg", hideFromStrip:true },
  { n:"اليوم السابع",   i:"٧",  id:"youm7",         domain:"youm7.com"             },
  { n:"Egypt Independent",i:"EI", id:"egypt_ind",    domain:"egyptindependent.com", hideFromStrip:true },
  { n:"عكاظ",          i:"ك",  id:"okaz",          domain:"okaz.com.sa"           },
  { n:"السومرية",      i:"سم", id:"alsumaria",     domain:"alsumaria.tv",         hideFromStrip:true },
  { n:"24 الإمارات",   i:"٢",  id:"uae24",         domain:"24.ae",                hideFromStrip:true },
  { n:"الشرق القطرية", i:"ق",  id:"alsharq",       domain:"al-sharq.com"          },
  { n:"اليوم",         i:"ل",  id:"alyaum",        domain:"alyaum.com"            },
  { n:"القدس العربي",  i:"ق",  id:"alquds",        domain:"alquds.co.uk"          },
  // مشرق عربي — لبنان، سوريا، الأردن، فلسطين
  { n:"النهار",        i:"نه", id:"annahar",       domain:"annahar.com",          hideFromStrip:true },
  { n:"إل بي سي آي",   i:"LB", id:"lbci",          domain:"lbcgroup.tv",          hideFromStrip:true },
  { n:"رؤيا",          i:"ر",  id:"roya",          domain:"royanews.tv",          hideFromStrip:true },
  { n:"المملكة",       i:"مم", id:"almamlaka",     domain:"almamlakatv.com",      hideFromStrip:true },
  { n:"سانا",          i:"س",  id:"sana",          domain:"sana.sy",              hideFromStrip:true },
  { n:"الغد",          i:"غ",  id:"alghad",        domain:"alghad.com"            },
  { n:"الميادين",      i:"مي", id:"almayadeen",    domain:"almayadeen.net",       hideFromStrip:true },
  { n:"الأخبار اللبنانية",i:"أخ",id:"alakhbar_lb", domain:"al-akhbar.com",        hideFromStrip:true },
  { n:"ترجمات عبرية",  i:"عب", id:"qudsn_heb",     domain:"t.me"                  },
  { n:"نعرف",          i:"نع", id:"ne3raf",        domain:"youtube.com",          hideFromStrip:true },
  { n:"زيد بنيامين",   i:"زب", id:"zaid_benjamin", domain:"x.com",                hideFromStrip:true },
  // Egypt & Gulf flagships
  { n:"الأهرام",       i:"هر", id:"ahram",         domain:"ahram.org.eg"          },
  { n:"مدى مصر",       i:"مد", id:"mada_masr",     domain:"madamasr.com"          },
  { n:"العين الإخبارية",i:"عن", id:"alain_ar",     domain:"al-ain.com",           hideFromStrip:true },
  // مغرب عربي
  { n:"هسبريس",        i:"هـ", id:"hespress",      domain:"hespress.com",         hideFromStrip:true },
  { n:"لو 360",        i:"360",id:"le360_ar",      domain:"ar.le360.ma",          hideFromStrip:true },
  { n:"الأولى المغربية",i:"SN", id:"snrt",          domain:"snrtnews.com",         hideFromStrip:true },
  { n:"الشروق الجزائرية",i:"شج",id:"echorouk",     domain:"echoroukonline.com",   hideFromStrip:true },
  { n:"الخبر",         i:"خب", id:"elkhabar",      domain:"elkhabar.com",         hideFromStrip:true },
  { n:"النهار الجزائرية",i:"نج",id:"ennahar_dz",   domain:"ennaharonline.com",    hideFromStrip:true },
  { n:"موزاييك إف إم", i:"MFM",id:"mosaiquefm",    domain:"mosaiquefm.net",       hideFromStrip:true },
  // ساحل وسودان وليبيا
  { n:"صحراء ميديا",   i:"صح", id:"sahara_media",  domain:"saharamedias.net",     hideFromStrip:true },
  { n:"سودان تريبيون", i:"ST", id:"sudan_tribune", domain:"sudantribune.net",     hideFromStrip:true },
  { n:"السوداني",      i:"سد", id:"alsudani",      domain:"alsudaninews.com",     hideFromStrip:true },
  // English sources (translated)
  { n:"BBC عالمي",     i:"BB", id:"bbc_en",        domain:"bbc.com"               },
  { n:"نيويورك تايمز", i:"NY", id:"nyt",           domain:"nytimes.com"           },
  { n:"فوكس نيوز",    i:"FX", id:"fox",           domain:"foxnews.com"           },
  { n:"BBC تقنية",     i:"BT", id:"bbc_tech",      domain:"bbc.com",              hideFromStrip:true },
  { n:"NBC نيوز",      i:"NB", id:"nbc",           domain:"nbcnews.com"           },
  { n:"NPR عالمي",     i:"NP", id:"npr",           domain:"npr.org"               },
  { n:"ABC نيوز",      i:"AB", id:"abc_en",        domain:"abcnews.go.com"        },
  { n:"سكاي نيوز EN",  i:"SK", id:"sky_en",        domain:"news.sky.com"          },
  // الصحافة الخليجية الإنجليزية (مترجمة)
  { n:"ذا ناشيونال",   i:"TN", id:"thenational",   domain:"thenationalnews.com",  hideFromStrip:true },
  { n:"غلف نيوز",      i:"GU", id:"gulfnews",      domain:"gulfnews.com",         hideFromStrip:true },
  { n:"عرب نيوز",      i:"AN", id:"arabnews",      domain:"arabnews.com",         hideFromStrip:true },
  { n:"العربية EN",    i:"عE", id:"alarabiya_en",  domain:"english.alarabiya.net",hideFromStrip:true },
  // الصحافة المغاربية الفرنسية (مترجمة)
  { n:"هسبريس FR",     i:"HF", id:"hespress_fr",   domain:"fr.hespress.com",      hideFromStrip:true },
  { n:"لو 360 FR",     i:"36F",id:"le360_fr",      domain:"fr.le360.ma",          hideFromStrip:true },
  // مصادر عالمية مترجمة
  { n:"الغارديان",     i:"G",  id:"guardian_w",    domain:"theguardian.com"       },
  { n:"رويترز EN",     i:"RE", id:"reuters_en",    domain:"reuters.com"           },
  { n:"واشنطن بوست",   i:"WP", id:"wapo_world",    domain:"washingtonpost.com"    },
  { n:"بلومبرغ",       i:"BL", id:"bloomberg",     domain:"bloomberg.com"         },
  { n:"CNN عالمي",     i:"CN", id:"cnn_en",        domain:"cnn.com"               },
  { n:"أكسيوس",        i:"AX", id:"axios",         domain:"axios.com"             },

  // ── PHOTO-GRID-ONLY SOURCES (photoOnly: true) ──────────────────
  // These appear only in the photo grid, not the main news feed or stories strip.

  // English photo-rich
  { n:"Wired",         i:"WD", id:"wired",         domain:"wired.com",         photoOnly: true },
  { n:"The Verge",     i:"VG", id:"verge",         domain:"theverge.com",      photoOnly: true },
  { n:"Atlas Obscura", i:"AO", id:"atlasobscura",  domain:"atlasobscura.com",  photoOnly: true },
  { n:"Smithsonian",   i:"SM", id:"smithsonian",   domain:"smithsonianmag.com",photoOnly: true },
  { n:"BBC Culture",   i:"BC", id:"bbc_culture",   domain:"bbc.com",           photoOnly: true },
  { n:"Ars Technica",  i:"AT", id:"arstechnica",   domain:"arstechnica.com",   photoOnly: true },
  // مجلات الفنون والتصوير الفرنسية
  { n:"Beaux Arts",           i:"BA",  id:"beauxarts",     domain:"beauxarts.com",           photoOnly: true },
  // ── Gap-fill batch (Apr 2026) — mirrors functions/api/feeds.js
  { n:"معا الإخبارية",  i:"مع", id:"maan_news",    domain:"maannews.net"       },
  { n:"المصدر اليمني",  i:"مص", id:"almasdar_ye",  domain:"almasdaronline.com" },
  { n:"شفق نيوز",       i:"شف", id:"shafaq",       domain:"shafaq.com"         },
  { n:"TRT عربي",       i:"TR", id:"trt_arabi",    domain:"trtarabi.com"       },
  { n:"الأناضول",       i:"أن", id:"anadolu_ar",   domain:"aa.com.tr"          },
  { n:"الرياض",         i:"ري", id:"alriyadh",     domain:"alriyadh.com"       },
  { n:"البيان",         i:"بي", id:"albayan_ae",   domain:"albayan.ae"         },

  { n:"Connaissance des Arts",i:"CA",  id:"connaissance",  domain:"connaissancedesarts.com", photoOnly: true },
  { n:"Le Journal des Arts",  i:"JA",  id:"jda",           domain:"lejournaldesarts.fr",     photoOnly: true },
  { n:"Télérama Arts",        i:"TR",  id:"telerama_arts", domain:"telerama.fr",             photoOnly: true },
  { n:"La Tribune de l'Art",  i:"TA",  id:"tribune_art",   domain:"latribunedelart.com",     photoOnly: true },
  { n:"Artsper Magazine",     i:"AP",  id:"artsper",       domain:"artsper.com",             photoOnly: true },
  { n:"ArtPress",             i:"AR",  id:"artpress",      domain:"artpress.com",            photoOnly: true },
  { n:"Blind Magazine",       i:"BM",  id:"blind_mag",     domain:"blind-magazine.com",      photoOnly: true },
  { n:"Fisheye Magazine",     i:"FM",  id:"fisheye_mag",   domain:"fisheyemagazine.fr",      photoOnly: true },
  { n:"Phototrend",           i:"PT",  id:"phototrend",    domain:"phototrend.fr",           photoOnly: true },
  { n:"Le Monde Arts",        i:"LMa", id:"lemonde_arts",  domain:"lemonde.fr",              photoOnly: true },
  { n:"Le Monde Photo",       i:"LMp", id:"lemonde_photo", domain:"lemonde.fr",              photoOnly: true },
];
