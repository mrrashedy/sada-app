// useNews hook — fetches from /api/feeds with fallback to sample data
import { useState, useEffect, useCallback } from 'react';

const API_URL = '/api/feeds';

// Sample data fallback when API is unavailable (local dev without Vercel)
const SAMPLE_FEED = [
  { id:"s1", source:{id:"aljazeera",name:"الجزيرة",initial:"ج"}, time:"منذ ٣ د", title:"قمة الرياض تختتم بإعلان تاريخي — خارطة طريق اقتصادية جديدة للشرق الأوسط", body:"القادة يتوافقون على إنشاء صندوق إقليمي بقيمة ١٠٠ مليار دولار لدعم التحول الرقمي والتكامل الاقتصادي في المنطقة", categories:["سياسة"], image:"", link:"#" },
  { id:"s2", source:{id:"alarabiya",name:"العربية",initial:"ع"}, time:"منذ ١٥ د", title:"حوار خاص مع رئيس أرامكو: ٥٠ مليار دولار للطاقة المتجددة", body:"في مقابلة حصرية يكشف الرئيس التنفيذي عن خطط الشركة لقيادة التحول في قطاع الطاقة", categories:["اقتصاد"], image:"", link:"#" },
  { id:"s3", source:{id:"reuters",name:"رويترز",initial:"R"}, time:"منذ ٢٨ د", title:"الدولار يتراجع أمام سلة العملات الرئيسية بعد بيانات التوظيف الأمريكية", body:"شهدت الأسواق تحركات لافتة مع صدور تقرير الوظائف الذي جاء دون التوقعات", categories:["اقتصاد"], image:"", link:"#" },
  { id:"s4", source:{id:"bbc",name:"BBC عربي",initial:"B"}, time:"منذ ٤٥ د", title:"لحظة إطلاق أول قمر صناعي عربي مشترك من قاعدة الإمارات الفضائية", body:"نجاح تاريخي في مجال الفضاء العربي مع إطلاق القمر الصناعي المشترك", categories:["تقنية"], image:"", link:"#" },
  { id:"s5", source:{id:"cnbc",name:"CNBC عربية",initial:"C"}, time:"منذ ساعة", title:"كيف يُعيد الذكاء الاصطناعي تشكيل صناعة الإعلام العربي؟", body:"تحليل معمّق لتأثير التقنيات الحديثة على غرف الأخبار وصناعة المحتوى", categories:["تقنية"], image:"", link:"#" },
  { id:"s6", source:{id:"skynews",name:"سكاي نيوز",initial:"S"}, time:"منذ ساعتين", title:"محادثات جنيف تحقق اختراقاً دبلوماسياً بشأن الملف النووي", body:"مصادر مطلعة تكشف عن تفاصيل الاتفاق الذي وصفه المبعوث الأممي بأنه خطوة تاريخية", categories:["سياسة"], image:"", link:"#" },
  { id:"s7", source:{id:"france24",name:"فرانس ٢٤",initial:"F"}, time:"منذ ٣ ساعات", title:"لماذا يحتاج العالم العربي إلى ثورة في صناعة النشر الرقمي؟", body:"الفجوة بين المحتوى العربي والعالمي تتسع يوماً بعد يوم", categories:["ثقافة"], image:"", link:"#" },
  { id:"s8", source:{id:"aljazeera",name:"الجزيرة",initial:"ج"}, time:"منذ ٤ ساعات", title:"المدن الذكية في الخليج — رحلة داخل نيوم ومدينة المستقبل", body:"أين وصلت المشاريع الكبرى وما التحديات الحقيقية التي تواجهها", categories:["تقنية"], image:"", link:"#" },
];

export function useNews(sources = []) {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: '40' });
      if (sources.length > 0) params.set('sources', sources.join(','));

      const res = await fetch(`${API_URL}?${params}`);
      if (!res.ok) throw new Error('API error');

      const data = await res.json();
      if (data.ok && data.feed.length > 0) {
        setFeed(data.feed);
        setIsLive(true);
      } else {
        throw new Error('Empty feed');
      }
    } catch (e) {
      // Fallback to sample data
      console.log('Using sample data:', e.message);
      setFeed(SAMPLE_FEED);
      setIsLive(false);
    }

    setLoading(false);
  }, [sources.join(',')]);

  useEffect(() => {
    fetchNews();
    // Refresh every 10 seconds
    const interval = setInterval(fetchNews, 10000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  return { feed, loading, error, isLive, refresh: fetchNews };
}
