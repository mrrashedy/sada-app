// Country name → ISO 3166-1 alpha-2 code dictionary.
// Covers Arabic + English names for ~40 countries that frequently appear in Arabic news.
// detectFlags(text) scans a headline/body and returns up to 3 country codes.
// Flags rendered as flat PNGs from flagcdn.com: https://flagcdn.com/20x15/{code}.png

const COUNTRY_CODES = [
  // Gulf
  { code: 'sa', names: ['السعودية','سعودي','saudi','riyadh','الرياض','جدة'] },
  { code: 'ae', names: ['الإمارات','إماراتي','uae','dubai','دبي','أبوظبي'] },
  { code: 'qa', names: ['قطر','qatar','الدوحة','doha'] },
  { code: 'kw', names: ['الكويت','kuwait'] },
  { code: 'bh', names: ['البحرين','bahrain'] },
  { code: 'om', names: ['سلطنة عمان','oman'] },
  // Levant
  { code: 'lb', names: ['لبنان','lebanon','بيروت','beirut'] },
  { code: 'sy', names: ['سوريا','syria','دمشق','damascus'] },
  { code: 'iq', names: ['العراق','iraq','بغداد','baghdad'] },
  { code: 'jo', names: ['الأردن','jordan','عمّان'] },
  { code: 'ps', names: ['فلسطين','غزة','palestine','gaza','الضفة'] },
  // North Africa
  { code: 'eg', names: ['مصر','egypt','القاهرة','cairo','الإسكندرية'] },
  { code: 'ly', names: ['ليبيا','libya','طرابلس'] },
  { code: 'tn', names: ['تونس','tunisia'] },
  { code: 'dz', names: ['الجزائر','algeria'] },
  { code: 'ma', names: ['المغرب','morocco','الرباط'] },
  { code: 'sd', names: ['السودان','sudan','الخرطوم'] },
  // Other Arab
  { code: 'ye', names: ['اليمن','yemen','صنعاء','الحوثي','الحوثيون'] },
  // Major powers
  { code: 'us', names: ['أمريكا','الولايات المتحدة','واشنطن','america','united states','washington','البيت الأبيض','البنتاغون','ترامب','بايدن'] },
  { code: 'ru', names: ['روسيا','موسكو','russia','moscow','بوتين','الكرملين'] },
  { code: 'cn', names: ['الصين','بكين','china','beijing'] },
  { code: 'gb', names: ['بريطانيا','لندن','britain','london','المملكة المتحدة'] },
  { code: 'fr', names: ['فرنسا','باريس','france','paris','ماكرون'] },
  { code: 'de', names: ['ألمانيا','germany','برلين','berlin'] },
  { code: 'ir', names: ['إيران','طهران','iran','tehran','الحرس الثوري'] },
  { code: 'tr', names: ['تركيا','أنقرة','turkey','türkiye','ankara','أردوغان'] },
  { code: 'il', names: ['إسرائيل','israel','تل أبيب','نتنياهو'] },
  { code: 'ua', names: ['أوكرانيا','كييف','ukraine','kyiv','زيلينسكي'] },
  { code: 'pk', names: ['باكستان','pakistan','إسلام آباد','islamabad'] },
  { code: 'in', names: ['الهند','india','نيودلهي','مودي'] },
  { code: 'jp', names: ['اليابان','japan','طوكيو'] },
  { code: 'kr', names: ['كوريا الجنوبية','south korea','سيول'] },
  { code: 'kp', names: ['كوريا الشمالية','north korea','بيونغيانغ'] },
  { code: 'it', names: ['إيطاليا','italy','روما'] },
  { code: 'es', names: ['إسبانيا','spain','مدريد'] },
  // Africa
  { code: 'so', names: ['الصومال','somalia'] },
  { code: 'et', names: ['إثيوبيا','ethiopia'] },
  // Americas
  { code: 'br', names: ['البرازيل','brazil'] },
  { code: 'mx', names: ['المكسيك','mexico'] },
  { code: 'ca', names: ['كندا','canada'] },
  { code: 'au', names: ['أستراليا','australia'] },
];

// Build a flat lookup for fast scanning
const LOOKUP = [];
for (const { code, names } of COUNTRY_CODES) {
  for (const name of names) {
    LOOKUP.push({ name: name.toLowerCase(), code });
  }
}
// Sort longest-first so "الولايات المتحدة" matches before "المتحدة"
LOOKUP.sort((a, b) => b.name.length - a.name.length);

export function detectFlags(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = new Set();
  for (const { name, code } of LOOKUP) {
    if (found.size >= 3) break;
    if (lower.includes(name)) found.add(code);
  }
  return [...found];
}

// Flag image URL helper — flat PNGs from flagcdn.com (20x15 is crisp at 2x)
export function flagUrl(code) {
  return `https://flagcdn.com/20x15/${code}.png`;
}
