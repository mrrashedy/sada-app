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
  const clusters = [];
  const seenIds = new Set();
  // Sort tokens by how many items they connect (largest cluster first)
  const entries = [...tokenToItems.entries()].sort((a, b) => b[1].size - a[1].size);
  for (const [tok, ids] of entries) {
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

// Reorder items so each cluster's members are adjacent to each other.
// Cluster block is placed at the position of its FIRST member in the
// original order. Non-cluster items retain their chronological position
// relative to other non-cluster items.
export function reorderWithClusters(items) {
  const clusters = findClusters(items);
  if (clusters.length === 0) return { items, emgMap: new Map(), clusters: [] };

  const memberSet = new Set();
  clusters.forEach(c => c.ids.forEach(id => memberSet.add(id)));

  const emitted = new Set();
  const out = [];
  const placed = new Set();
  for (const it of items) {
    if (placed.has(it.id)) continue;
    if (memberSet.has(it.id)) {
      const cluster = clusters.find(c => c.ids.includes(it.id));
      if (cluster && !emitted.has(cluster.anchor)) {
        // Emit all members in their original chronological order
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
  for (const cluster of clusters) {
    const orderedIds = out.filter(it => cluster.ids.includes(it.id)).map(it => it.id);
    orderedIds.forEach((id, idx) => {
      emgMap.set(id, idx === 0 ? 'start' : idx === orderedIds.length - 1 ? 'end' : 'mid');
    });
  }

  return { items: out, emgMap, clusters };
}
