// DepthDetail — the full-screen reading surface for a single Basira document.
//
// When the user taps a block in the depth feed, ArticleDetail is the wrong
// renderer: it's built for news posts (image strap, tag pill, reactions,
// tag-overlap related) and has no idea what to do with analytical_conclusion,
// core_argument, tensions, if_correct_then, etc. So depth gets its own
// detail shell.
//
// We reuse the same `.detail` / `.det-hdr` / `.det-body` container classes
// from global.css so the slide-in animation, sticky header, and safe-area
// padding all match the rest of the app. The body contents, though, are
// the full v2 analytical scaffold — no truncation, no teasing, nothing
// hidden. This is where a reader actually sits and thinks.
//
// Layout order mirrors DepthPost but goes deeper:
//   1. Source + category + tier + document-type chips
//   2. Full title
//   3. Flagship pullquote (analytical_conclusion, or thesis as fallback)
//   4. Core argument — the author's own framing
//   5. Supporting logic — how they build the case
//   6. Analytical frame — the lens they're looking through
//   7. Hidden assumptions — the load-bearing beliefs left unstated
//   8. Tensions — where the argument strains against itself
//   9. If-correct-then — the consequence chain
//  10. Every key quote (not just the first) with context captions
//  11. Full body text, paragraph-broken
//  12. Scaffolding — all frameworks, regions, actors, topic tags
//  13. Arabic + English summaries (long-form) when present
//  14. "Read at source" CTA at the bottom

import { I } from '../shared/Icons';
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

// Inline Section helper — same contract as DepthPost's: null out when empty
// so the parent doesn't have to guard every line.
function Section({ label, children, className = '' }) {
  if (!children) return null;
  return (
    <div className={`depth-section ${className}`}>
      <div className="depth-section-label">{label}</div>
      <div className="depth-section-body" dir="auto">{children}</div>
    </div>
  );
}

export function DepthDetail({ doc, onClose }) {
  if (!doc) return null;

  const cat = doc.category || 'think_tank';
  const catLabel = CATEGORY_LABEL_AR[cat] || cat.replace(/_/g, ' ');
  const catColor = CATEGORY_COLOR[cat] || 'var(--t3)';
  const tier = tierFromPriority(doc.priority || doc.tier || null);
  const docTypeLabel = doc.document_type ? DOCTYPE_LABEL_AR[doc.document_type] : null;

  const titleIsArabic = doc.language === 'ar' || detectArabic(doc.title);

  const flagship = doc.analytical_conclusion || doc.thesis;
  const hasAnalysis = !!(flagship || doc.core_argument || doc.supporting_logic);

  // Unlike DepthPost we show *every* quote here, not just the first.
  const quotes = Array.isArray(doc.key_quotes) ? doc.key_quotes : [];

  // Full assumption list, not capped at 3.
  const assumptions = Array.isArray(doc.assumptions) ? doc.assumptions : [];

  const frameworks = Array.isArray(doc.frameworks) ? doc.frameworks : [];
  const regions = Array.isArray(doc.regions) ? doc.regions : [];
  const actors = Array.isArray(doc.actors) ? doc.actors : [];
  const topics = Array.isArray(doc.tags) ? doc.tags : [];

  // Full body text, paragraph-broken. This is the "just let me read it"
  // surface — no truncation, no teasing. If Basira has 20k chars of body,
  // we show 20k chars.
  const rawBody = doc.body || doc.brief || '';
  const bodyParagraphs = rawBody
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  const sourceUrl = doc.canonical_url || doc.link;

  return (
    <div className="detail depth-detail">
      <div className="det-hdr">
        <button className="ib" onClick={() => { Sound.close(); onClose?.(); }}>{I.back()}</button>
        <div style={{ display: 'flex', gap: 14 }}>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ib"
              style={{ textDecoration: 'none' }}
              aria-label="Open source"
              onClick={() => Sound.open()}
            >
              {I.link()}
            </a>
          )}
        </div>
      </div>

      <div className="det-body depth-detail-body">
        {/* ─────────── Header chips ─────────── */}
        <header className="depth-meta" style={{ marginBottom: 14 }}>
          <span className="depth-src">
            {(doc.s?.logo || doc.s?.domain) && (
              <img
                className="depth-src-logo"
                src={doc.s.logo || `https://www.google.com/s2/favicons?domain=${doc.s.domain}&sz=64`}
                alt=""
                loading="lazy"
                onError={e => { e.currentTarget.remove(); }}
              />
            )}
            <span className="depth-src-name">{doc.s?.n || 'unknown'}</span>
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
        <h1
          className="depth-detail-title"
          dir="auto"
          lang={titleIsArabic ? 'ar' : undefined}
        >
          {doc.title}
        </h1>

        {/* ─────────── Flagship pullquote ─────────── */}
        {flagship && (
          <blockquote className="depth-flagship depth-detail-flagship" dir="auto">
            <span className="depth-flagship-mark">الخلاصة</span>
            {flagship}
          </blockquote>
        )}

        {/* ─────────── Core argument ─────────── */}
        <Section label="حُجّة المؤلّف" className="depth-core-arg">
          {doc.core_argument}
        </Section>

        {/* ─────────── Supporting logic ─────────── */}
        <Section label="المنطق الاستدلالي">
          {doc.supporting_logic}
        </Section>

        {/* ─────────── Analytical frame ─────────── */}
        <Section label="الإطار التحليلي">
          {doc.analytical_frame}
        </Section>

        {/* ─────────── Assumptions (full list, not capped) ─────────── */}
        {assumptions.length > 0 && (
          <div className="depth-section depth-assumptions">
            <div className="depth-section-label">افتراضات ضمنية</div>
            <ul className="depth-section-list">
              {assumptions.map((a, i) => (
                <li key={i} dir="auto">{a}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ─────────── Tensions ─────────── */}
        <Section label="مواطن التوتّر" className="depth-tensions">
          {doc.tensions}
        </Section>

        {/* ─────────── If-correct-then ─────────── */}
        <Section label="إذا صحّ ذلك…" className="depth-if-then">
          {doc.if_correct_then}
        </Section>

        {/* ─────────── All key quotes ─────────── */}
        {quotes.length > 0 && (
          <div className="depth-detail-quotes">
            {quotes.map((q, i) => (
              <figure key={i} className="depth-quote">
                <blockquote dir="auto">
                  {typeof q === 'string' ? q : q.quote}
                </blockquote>
                {typeof q === 'object' && q.context && (
                  <figcaption dir="auto">{q.context}</figcaption>
                )}
              </figure>
            ))}
          </div>
        )}

        {/* ─────────── Full body text ─────────── */}
        {bodyParagraphs.length > 0 && (
          <div className="depth-body depth-detail-body-text" dir="auto">
            {bodyParagraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}

        {/* ─────────── Scaffolding: frameworks / regions / actors ─────────── */}
        {(frameworks.length > 0 || regions.length > 0 || actors.length > 0) && (
          <div className="depth-scaffold">
            {frameworks.length > 0 && (
              <div className="depth-scaffold-row">
                <span className="depth-scaffold-label">الأطر النظرية</span>
                {frameworks.map((f, i) => (
                  <span key={i} className="depth-tag depth-tag-framework">{f}</span>
                ))}
              </div>
            )}
            {regions.length > 0 && (
              <div className="depth-scaffold-row">
                <span className="depth-scaffold-label">المناطق</span>
                {regions.map((r, i) => (
                  <span key={i} className="depth-tag depth-tag-region">{r}</span>
                ))}
              </div>
            )}
            {actors.length > 0 && (
              <div className="depth-scaffold-row">
                <span className="depth-scaffold-label">الفاعلون</span>
                {actors.map((a, i) => (
                  <span key={i} className="depth-tag depth-tag-actor">{a}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─────────── Long-form summaries ─────────── */}
        {doc.ar_summary && (
          <div className="depth-detail-summary">
            <div className="depth-section-label">ملخّص بالعربية</div>
            <div className="depth-detail-summary-body" dir="rtl" lang="ar">
              {doc.ar_summary}
            </div>
          </div>
        )}
        {doc.en_summary && (
          <div className="depth-detail-summary">
            <div className="depth-section-label">English summary</div>
            <div
              className="depth-detail-summary-body"
              dir="ltr"
              lang="en"
              style={{ textAlign: 'left', fontStyle: 'normal' }}
            >
              {doc.en_summary}
            </div>
          </div>
        )}

        {/* ─────────── Topic tags ─────────── */}
        {topics.length > 0 && (
          <div className="depth-topics" style={{ marginTop: 18 }}>
            {topics.map((t, i) => (
              <span key={i} className="depth-tag">#{t}</span>
            ))}
          </div>
        )}

        {/* ─────────── Read-at-source CTA ─────────── */}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="det-cta depth-detail-cta"
            onClick={() => Sound.open()}
          >
            قراءة المصدر الأصلي في {doc.s?.n || 'الموقع'} ←
          </a>
        )}
      </div>
    </div>
  );
}
