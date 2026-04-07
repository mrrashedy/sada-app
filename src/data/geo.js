export const GEO_MAP = [
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

export function detectGeoFromText(text) {
  if (!text) return null;
  for (const geo of GEO_MAP) {
    if (geo.keywords.some(kw => text.includes(kw))) return geo;
  }
  return null;
}
