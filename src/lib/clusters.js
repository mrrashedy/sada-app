// clusters.js — semantic emergency clusters for the feed
//
// Framing philosophy: the visible red "state of emergency" block is a
// framing element that pulls partial fragments of the SAME story together
// so the user reads one developing event, not four coincident alarms.
//
// This module replaces the old 3-in-a-row positional detector. It:
//   1. Finds breaking items whose titles share a repeating 3+ char token
//      across at least 3 items (→ that shared token is the "anchor").
//   2. Returns a reorder plan that pulls cluster members adjacent, while
//      preserving chronological order of everything else.
//   3. Returns emg roles ('start' | 'mid' | 'end') matching the existing
//      .post-emg-* CSS — no new styles, just a smarter decision of which
//      items deserve the existing block.
//
// No stopword list, no NER, no language model. Pure token overlap.

function tokenize(text) {
  if (!text) return [];
  return text
    .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

// One cluster per TOPIC. Each 3+char token that repeats across ≥2 brk
// items becomes a candidate topic anchor. Greedy claim by biggest
// specific cluster first — so "إيران" (3 items) and "إسرائيل" (3 items)
// form two DISTINCT clusters, each at its own timeline position. No
// transitive merging: items are claimed by exactly one anchor.
//
// Over-generic tokens (appearing in >50% of the breaking slice) are
// dropped — they'd collapse unrelated stories into a single block.
export function findClusters(items) {
  const brks = items.filter(i => i?.brk);
  if (brks.length < 2) return [];

  const tokenToItems = new Map();
  for (const it of brks) {
    const tokens = new Set(tokenize(it.title));
    for (const tok of tokens) {
      if (!tokenToItems.has(tok)) tokenToItems.set(tok, new Set());
      tokenToItems.get(tok).add(it.id);
    }
  }

  // A good topic anchor appears in ≥2 items but NOT in too many —
  // a token shared by >50% of brks is a common word, not a topic.
  const maxSize = Math.max(4, Math.ceil(brks.length * 0.5));
  const candidates = [...tokenToItems.entries()]
    .filter(([_, s]) => s.size >= 2 && s.size <= maxSize)
    // Biggest specific cluster first; tiebreak: longer token (more specific entity)
    .sort((a, b) => b[1].size - a[1].size || b[0].length - a[0].length);

  const clusters = [];
  const claimed = new Set();
  for (const [anchor, ids] of candidates) {
    const available = [...ids].filter(id => !claimed.has(id));
    if (available.length >= 2) {
      clusters.push({ anchor, ids: available });
      available.forEach(id => claimed.add(id));
    }
  }
  return clusters;
}

// Reorder items so each cluster's members are adjacent to each other.
// Cluster block is placed at the position of its FIRST member in the
// original order. Non-cluster items retain their chronological position
// relative to other non-cluster items.
export function reorderWithClusters(items) {
  const clusters = findClusters(items);
  if (clusters.length === 0) return { items, emgMap: new Map(), clusters: [] };

  const memberSet = new Set();
  clusters.forEach(c => c.ids.forEach(id => memberSet.add(id)));

  // Feed is DESC-sorted (newest first). So the FIRST cluster member we
  // encounter during iteration IS the newest one — emitting the whole
  // block at that position anchors the cluster to its freshest item's
  // timeline slot. Older members follow immediately below (newest-first
  // within the block); any non-cluster items that were interleaved get
  // pushed below the cluster.
  const emitted = new Set();
  const out = [];
  const placed = new Set();
  for (const it of items) {
    if (placed.has(it.id)) continue;
    if (memberSet.has(it.id)) {
      const cluster = clusters.find(c => c.ids.includes(it.id));
      if (cluster && !emitted.has(cluster.anchor)) {
        const members = items.filter(x => cluster.ids.includes(x.id));
        members.forEach(m => { out.push(m); placed.add(m.id); });
        emitted.add(cluster.anchor);
      }
    } else {
      out.push(it);
      placed.add(it.id);
    }
  }

  const emgMap = new Map();
  const labelMap = new Map();
  const LABELS = ['متواصل', 'متجدد', 'مفتوح'];
  clusters.forEach((cluster, cIdx) => {
    const orderedIds = out.filter(it => cluster.ids.includes(it.id)).map(it => it.id);
    orderedIds.forEach((id, idx) => {
      emgMap.set(id, idx === 0 ? 'start' : idx === orderedIds.length - 1 ? 'end' : 'mid');
    });
    if (orderedIds.length > 0) labelMap.set(orderedIds[0], LABELS[cIdx % LABELS.length]);
  });

  return { items: out, emgMap, labelMap, clusters };
}
