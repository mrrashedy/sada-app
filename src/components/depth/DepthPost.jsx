// DepthPost — the rich, detail-forward block used in the Basira vertical.
//
// Unlike the main feed's Post, a DepthPost is built for readers who want
// the whole argument, not a headline. It renders the full v2 decomposition
// Basira produces: the real claim (analytical_conclusion), the core argument
// in the author's framing, the supporting logic, the hidden assumptions,
// the analytical frame, the tensions inside the piece, and the "if this is
// correct, then..." consequence chain. Plus frameworks, regions, actors,
// the best quote, and the English summary — all in one block.
//
// Layout order matches how a thoughtful reader actually moves through an
// analytical document:
//   1. Who wrote it (source + category + tier)
//   2. What is it (title)
//   3. What does it *really* say, stripped (analytical_conclusion as pullquote)
//   4. What is the author's framing (core_argument)
//   5. How do they build it (supporting_logic, assumptions, analytical_frame)
//   6. Where does it strain (tensions)
//   7. Why does it matter (if_correct_then)
//   8. A representative quote
//   9. A short English summary fallback
//  10. Regions / actors / topics chips
//  11. Link to the source
//
// Every section is conditional — if Basira hasn't populated a field (e.g.
// because analysis is pending or the document is short), that section
// simply does not render. The block gracefully degrades from "full v2
// decomposition" through "thesis + summary" down to "title + source".

import { Sound } from '../../lib/sounds';

const CATEGORY_LABEL_AR = {
  think_tank: 'مركز أبحاث',
  specialized: 'بحث متخصّص',
  university: 'جامعي',
  official: 'مصدر رسمي',
  multilateral: 'منظمة دولية',
  media: 'صحافة تحليلية',
  think_tank_media: 'منبر تحليلي',
  data: 'بيانات ومؤشرات',
  conference: 'مؤتمر',
};

const CATEGORY_COLOR = {
  think_tank: '#B88A2E',
  specialized: '#6F8F5B',
  university: '#8C5E92',
  official: '#A07548',
  multilateral: '#3F6AA8',
  media: '#B04E4E',
  think_tank_media: '#A07548',
  data: '#3E8E86',
  conference: '#A87850',
};

const DOCTYPE_LABEL_AR = {
  paper: 'ورقة بحثية',
  policy_brief: 'موجز سياسات',
  report: 'تقرير',
  statement: 'بيان',
  speech: 'خطاب',
  working_paper: 'ورقة عمل',
  dataset_release: 'إصدار بيانات',
  conference_proceedings: 'أعمال مؤتمر',
  long_form_article: 'مقال مطوّل',
  press_release: 'نشرة صحفية',
  communique: 'بيان ختامي',
  data_note: 'مذكرة بيانات',
};

function tierFromPriority(priority) {
  if (!priority) return null;
  const m = String(priority).match(/\d/);
  return m ? m[0] : null;
}

function detectArabic(str) {
  return !!str && /[\u0600-\u06FF]/.test(str);
}

// buildBriefRows — turn whatever text is available into a short structured
// list of key-point rows for the card brief. Prefers the v2 analytical
// decomposition (when analysis is done), falls back to splitting the raw
// body into its first 2–3 sentences when it isn't. Each row is a short
// self-contained claim, rendered as a labeled bullet so the card reads as
// scannable structure rather than a paragraph blob.
//
// Returns an array of { label, text } — at most 3 items, each <280 chars.
// Empty array means "nothing worth showing here".
function buildBriefRows(item) {
  const rows = [];

  // v2 path: each of these is a single sentence in Claude's output, so we
  // can just drop them straight into the row list with their semantic label.
  if (item.core_argument) rows.push({ label: 'الحجة', text: item.core_argument });
  if (item.if_correct_then) rows.push({ label: 'الأثر', text: item.if_correct_then });
  if (item.tensions) rows.push({ label: 'التوتّر', text: item.tensions });
  if (rows.length > 0) return rows.slice(0, 3);

  // Pending path: split the raw body on sentence terminators (Latin and
  // Arabic) and keep the first few that look like full sentences. The
  // length filter skips ultra-short fragments ("Read more →") and run-on
  // blocks that weren't properly tokenized.
  const raw = (item.body || item.brief || '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/(?<=[.!?؟؛])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 24 && s.length <= 260);
  return parts.slice(0, 3).map(text => ({ label: null, text }));
}

// Small helper to render a labeled analytical section. Returns null so we
// can conditionally include without a wrapper div.
function Section({ label, children, className = '' }) {
  if (!children) return null;
  return (
    <div className={`depth-section ${className}`}>
      <div className="depth-section-label">{label}</div>
      <div className="depth-section-body" dir="auto">{children}</div>
    </div>
  );
}

export function DepthPost({ item, delay = 0, index = 0, onOpen }) {
  const cat = item.category || 'think_tank';
  const catLabel = CATEGORY_LABEL_AR[cat] || cat.replace(/_/g, ' ');
  const catColor = CATEGORY_COLOR[cat] || 'var(--t3)';
  const tier = tierFromPriority(item.priority || item.tier || null);
  const docTypeLabel = item.document_type ? DOCTYPE_LABEL_AR[item.document_type] : null;

  const titleIsArabic = item.language === 'ar' || detectArabic(item.title);

  // The analytical conclusion is the flagship v2 field — "the real claim,
  // institutional language stripped". Fall back to legacy `thesis` when
  // analytical_conclusion isn't present (e.g. items analyzed under v1).
  const flagship = item.analytical_conclusion || item.thesis;
  const hasAnalysis = !!(flagship || item.core_argument);

  // The best single quote, if the analyst picked one out.
  const topQuote =
    Array.isArray(item.key_quotes) && item.key_quotes.length > 0
      ? item.key_quotes[0]
      : null;

  // ── Secondary slot ──────────────────────────────────────────────────
  // Editorial scope (Apr 2026): the only secondary surface a depth card
  // shows is a quote, and only when the analyst actually pulled one. No
  // relevance line, no supporting_logic — the conclusion carries the
  // card on its own. Quotes are deliberately occasional, not on every
  // card, so the timeline keeps visual rhythm.
  const hasQuote = !!topQuote;
  const activeSecondary = hasQuote ? 'quote' : null;

  // Assumptions are stored as an array on the v2 schema. Show up to 3.
  const assumptions =
    Array.isArray(item.assumptions) && item.assumptions.length > 0
      ? item.assumptions.slice(0, 3)
      : null;

  const frameworks =
    Array.isArray(item.frameworks) && item.frameworks.length > 0
      ? item.frameworks.slice(0, 3)
      : null;

  const regions =
    Array.isArray(item.regions) && item.regions.length > 0
      ? item.regions.slice(0, 4)
      : null;

  const actors =
    Array.isArray(item.actors) && item.actors.length > 0
      ? item.actors.slice(0, 4)
      : null;

  const topics =
    Array.isArray(item.tags) && item.tags.length > 0
      ? item.tags.slice(0, 4)
      : null;

  // Structured brief — 2–3 labeled/unlabeled rows. Only renders when there's
  // no flagship pullquote already providing the anchor for the card (flagship
  // + structured-brief would compete for the same slot). When flagship is
  // present, the existing v2 section blocks below carry the structure.
  const briefRows = buildBriefRows(item);

  const handleClick = () => {
    Sound.open();
    if (onOpen) {
      onOpen(item);
    } else if (item.canonical_url || item.link) {
      window.open(item.canonical_url || item.link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <article className="depth-post" style={{ animationDelay: `${delay}s` }} onClick={handleClick}>
      {/* ─────────── Header: source + category + tier + type ─────────── */}
      <header className="depth-meta">
        <span className="depth-src">
          {(item.s?.logo || item.s?.domain) && (
            <img
              className="depth-src-logo"
              src={item.s.logo || `https://www.google.com/s2/favicons?domain=${item.s.domain}&sz=64`}
              alt=""
              loading="lazy"
              onError={e => { e.currentTarget.remove(); }}
            />
          )}
          <span className="depth-src-name">{item.s?.n || 'unknown'}</span>
        </span>
        <span className="depth-chip" style={{ color: catColor, borderColor: `${catColor}44` }}>
          {catLabel}
        </span>
        {tier && (
          <span className={`depth-chip depth-tier-${tier}`}>Tier {tier}</span>
        )}
        {docTypeLabel && (
          <span className="depth-chip depth-doctype">{docTypeLabel}</span>
        )}
        {!hasAnalysis && (
          <span className="depth-chip depth-pending">تحليل قيد الإعداد</span>
        )}
      </header>

      {/* ─────────── Title ─────────── */}
      <h2 className="depth-title" dir="auto" lang={titleIsArabic ? 'ar' : undefined}>
        {item.title}
      </h2>

      {/* ─────────── Flagship: the real claim, stripped ─────────── */}
      {flagship && (
        <blockquote className="depth-flagship" dir="auto">
          <span className="depth-flagship-mark">الخلاصة</span>
          {flagship}
        </blockquote>
      )}

      {/* ─────────── Secondary element (alternating per card) ────────
          Each card shows ONE of: quote / tension / "why it matters".
          The slot rotates by card index so the timeline has variety.
          Full decomposition (core_argument, analytical_frame, etc.)
          only renders in the detail modal, not on the timeline card. */}

      {activeSecondary === 'quote' && topQuote && (
        <figure className="depth-quote">
          <blockquote dir="auto">
            {typeof topQuote === 'string' ? topQuote : topQuote.quote}
          </blockquote>
          {typeof topQuote === 'object' && topQuote.context && (
            <figcaption dir="auto">{topQuote.context}</figcaption>
          )}
        </figure>
      )}

      {/* ─────────── Structured brief ───────────
          A short, scannable list of key-point rows that replaces the old
          multi-paragraph body block on the card. Each row is one short
          sentence — either a labeled v2 decomposition field (الحجة / الأثر
          / التوتّر) when analysis is done, or the first few sentences of
          the raw body when analysis is still pending. Rendered as a
          labeled rule-list so the brief reads as structure, not prose.
          Suppressed entirely when a flagship pullquote is already
          anchoring the card — the flagship carries the same signal. */}
      {!flagship && briefRows.length > 0 && (
        <div className="depth-brief-rows">
          <div className="depth-section-label">أبرز النقاط</div>
          {briefRows.map((row, i) => (
            <div key={i} className="depth-brief-row" dir="auto">
              {row.label && <span className="depth-brief-row-label">{row.label}</span>}
              <span className="depth-brief-row-text">{row.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─────────── Scaffolding: frameworks / regions / actors ─────────── */}
      {(frameworks || regions || actors) && (
        <div className="depth-scaffold">
          {frameworks && (
            <div className="depth-scaffold-row">
              <span className="depth-scaffold-label">الأطر النظرية</span>
              {frameworks.map((f, i) => (
                <span key={i} className="depth-tag depth-tag-framework">{f}</span>
              ))}
            </div>
          )}
          {regions && (
            <div className="depth-scaffold-row">
              <span className="depth-scaffold-label">المناطق</span>
              {regions.map((r, i) => (
                <span key={i} className="depth-tag depth-tag-region">{r}</span>
              ))}
            </div>
          )}
          {actors && (
            <div className="depth-scaffold-row">
              <span className="depth-scaffold-label">الفاعلون</span>
              {actors.map((a, i) => (
                <span key={i} className="depth-tag depth-tag-actor">{a}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────── Footer: topic tags + read link ─────────── */}
      <footer className="depth-foot">
        {topics && (
          <div className="depth-topics">
            {topics.map((t, i) => (
              <span key={i} className="depth-tag">#{t}</span>
            ))}
          </div>
        )}
        {(item.canonical_url || item.link) && (
          <span className="depth-read">قراءة المصدر ↗</span>
        )}
      </footer>
    </article>
  );
}
