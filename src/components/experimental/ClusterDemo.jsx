import { useState, useMemo } from 'react';
import { Post } from '../feed/Post';
import '../../styles/global.css';

// ClusterDemo — isolated sandbox at ?clusterdemo=1
//
// Shows the same sample feed in two modes:
//   "chronological" — items in strict time order (how feed looks today)
//   "clustered"     — related breaking items pulled adjacent via title-overlap
//                     so the EXISTING .post-emg block wraps them naturally
//
// No new styles. No entity extractor. No stopword list. Reorder + reuse.

const NOW = Date.now();
const mins = (n) => new Date(NOW - n * 60_000).toISOString();

// Hand-crafted sample covering the three scenarios from the discussion
const SAMPLE = [
  { id: 'r1', title: 'عاجل: قصف عنيف على شرق رفح',            brk: true,  tag: 'عاجل', t: '14m', pubTs: NOW - 14*60_000, s: { i:'ج', n:'الجزيرة',  id:'aljazeera' }, body: 'مصادر محلية تفيد بسقوط قذائف على أحياء شرق رفح.' },
  { id: 'e1', title: 'الدولار يقفز أمام الجنيه في السوق الموازية',                     tag: 'اقتصاد', t: '13m', pubTs: NOW - 13*60_000, s: { i:'أ', n:'الأهرام',  id:'ahram' }, body: 'تذبذب واضح في أسعار الصرف بعد قرار البنك المركزي.' },
  { id: 'f1', title: 'ريال مدريد يتصدر الدوري بفوز صعب',        brk: true,  tag: 'عاجل', t: '12m', pubTs: NOW - 12*60_000, s: { i:'س', n:'سكاي نيوز', id:'skynews' }, body: 'هدف قاتل في الدقيقة التسعين يمنح الريال الصدارة.' },
  { id: 'r2', title: 'شهود: انفجارات متتالية في رفح',            brk: true,  tag: 'عاجل', t: '11m', pubTs: NOW - 11*60_000, s: { i:'ع', n:'العربية',   id:'alarabiya' }, body: 'شهود عيان يصفون ليلة عصيبة في رفح مع استمرار القصف.' },
  { id: 'a1', title: 'تحليل: السوق المصرية أمام اختبار صعب',                           tag: 'تحليل', t: '10m', pubTs: NOW - 10*60_000, s: { i:'ي', n:'اليوم السابع', id:'youm7' }, body: 'قراءة في بيانات التضخم الأخيرة.' },
  { id: 'r3', title: 'الأمم المتحدة تعرب عن قلق بالغ من تطورات رفح', brk: true, tag: 'عاجل', t: '9m',  pubTs: NOW - 9*60_000,  s: { i:'ب', n:'بي بي سي',  id:'bbc' }, body: 'بيان أممي يطالب بوقف فوري للعمليات في رفح.' },
  { id: 'f2', title: 'ميسي يسجل هاتريك في مباراة ودية',                                 tag: 'رياضة', t: '8m',  pubTs: NOW - 8*60_000,  s: { i:'ج', n:'الجزيرة',  id:'aljazeera' }, body: 'ثلاثية تاريخية في مباراة ودية.' },
  { id: 'r4', title: 'إجلاء نحو 200 عائلة من أحياء شرق رفح',   brk: true,  tag: 'عاجل', t: '7m',  pubTs: NOW - 7*60_000,  s: { i:'س', n:'سكاي نيوز', id:'skynews' }, body: 'عمليات إجلاء واسعة تحت جنح الليل.' },
  { id: 'p1', title: 'وفاة رئيس وزراء سابق في المغرب',          brk: true,  tag: 'عاجل', t: '6m',  pubTs: NOW - 6*60_000,  s: { i:'ه', n:'هسبريس',   id:'hespress' }, body: 'نعى الديوان الملكي رئيس الوزراء الأسبق.' },
  { id: 'n1', title: 'افتتاح معرض للفنون التشكيلية في الرياض',                           tag: 'ثقافة', t: '5m',  pubTs: NOW - 5*60_000,  s: { i:'ع', n:'عكاظ',      id:'okaz' }, body: 'المعرض يضم أعمال 30 فنانا من المنطقة.' },
];

// Extract meaningful tokens from a title: words of ≥3 chars, deduped.
// No stopword list — we just look for overlap frequency across items.
function tokenize(text) {
  if (!text) return [];
  return text
    .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

// Build a cluster by finding groups of .brk items whose titles share a
// token that repeats across ≥2 of them. Returns Map<clusterId, itemIds[]>.
function findClusters(items) {
  const brks = items.filter(i => i.brk);
  const tokenToItems = new Map();
  for (const it of brks) {
    const tokens = new Set(tokenize(it.title));
    for (const tok of tokens) {
      if (!tokenToItems.has(tok)) tokenToItems.set(tok, new Set());
      tokenToItems.get(tok).add(it.id);
    }
  }
  // A token that repeats in 3+ breaking items = a cluster anchor
  const clusters = [];
  const seenIds = new Set();
  for (const [tok, ids] of tokenToItems) {
    if (ids.size >= 2) {
      const newIds = [...ids].filter(id => !seenIds.has(id));
      if (newIds.length >= 2) {
        clusters.push({ anchor: tok, ids: newIds });
        newIds.forEach(id => seenIds.add(id));
      }
    }
  }
  return clusters;
}

// Reorder: move cluster items adjacent to each other, anchored at the
// position of the cluster's freshest member. Non-cluster items keep their
// relative chronological order.
function reorder(items) {
  const clusters = findClusters(items);
  if (clusters.length === 0) return { items, emgMap: new Map() };

  const clusterMemberSet = new Set();
  clusters.forEach(c => c.ids.forEach(id => clusterMemberSet.add(id)));

  const out = [];
  const placed = new Set();
  for (const it of items) {
    if (placed.has(it.id)) continue;
    if (clusterMemberSet.has(it.id)) {
      // find which cluster
      const cluster = clusters.find(c => c.ids.includes(it.id));
      if (cluster && !cluster._emitted) {
        // Emit all cluster members here, in their chronological order
        const members = items.filter(x => cluster.ids.includes(x.id));
        members.forEach(m => { out.push(m); placed.add(m.id); });
        cluster._emitted = true;
      }
    } else {
      out.push(it);
      placed.add(it.id);
    }
  }

  // Now compute emg roles for each cluster
  const emgMap = new Map();
  for (const cluster of clusters) {
    const orderedIds = out.filter(it => cluster.ids.includes(it.id)).map(it => it.id);
    orderedIds.forEach((id, idx) => {
      emgMap.set(id, idx === 0 ? 'start' : idx === orderedIds.length - 1 ? 'end' : 'mid');
    });
  }

  return { items: out, emgMap };
}

export function ClusterDemo() {
  const [mode, setMode] = useState('clustered'); // 'chronological' | 'clustered'

  const { items, emgMap, clusterInfo } = useMemo(() => {
    if (mode === 'chronological') return { items: SAMPLE, emgMap: new Map(), clusterInfo: null };
    const { items, emgMap } = reorder(SAMPLE);
    const clusters = findClusters(SAMPLE);
    return { items, emgMap, clusterInfo: clusters };
  }, [mode]);

  const noop = () => {};

  return (
    <div className="app">
      <div className="hdr">
        <div className="hdr-top">
          <div className="logo"><span className="logo-icon">ت</span>تجربة التجميع</div>
        </div>
        <div className="tabs">
          <button
            className={`tab ${mode === 'chronological' ? 'on' : ''}`}
            onClick={() => setMode('chronological')}
          >حسب الوقت</button>
          <button
            className={`tab ${mode === 'clustered' ? 'on' : ''}`}
            onClick={() => setMode('clustered')}
          >مجمّع</button>
        </div>
      </div>

      <div className="content">
        {mode === 'clustered' && clusterInfo && clusterInfo.length > 0 && (
          <div style={{ padding:'12px 20px 0',fontSize:11,color:'var(--t3)',direction:'rtl' }}>
            {clusterInfo.length} مجموعة تم اكتشافها · محور: {clusterInfo.map(c => c.anchor).join('، ')}
          </div>
        )}
        <div style={{ padding:'12px 20px',fontSize:11,color:'var(--t4)',direction:'rtl' }}>
          {mode === 'chronological'
            ? 'العرض الزمني الحالي — الأخبار مبعثرة حسب وقت الوصول'
            : 'العرض المجمّع — الأخبار المترابطة تُسحب بجانب بعضها لتغلّفها الكتلة الحمراء الحالية'}
        </div>
        {items.map((item, i) => (
          <Post
            key={item.id}
            item={item}
            delay={i * 0.04}
            emg={emgMap.get(item.id)}
            onOpen={noop}
            onSave={noop}
            isSaved={false}
            onInterest={noop}
            isInterested={false}
            onHide={noop}
            onSelectSource={noop}
            showImg={false}
          />
        ))}
      </div>
    </div>
  );
}
