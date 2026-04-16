// DepthFeed — the Basira vertical inside Sada.
//
// This is the "studies" section sitting where the photo grid used to be.
// It fetches analytical documents from the Basira engine (think tanks,
// ministries, multilaterals, universities, long-form media) and shows them
// as denser, more argument-forward blocks than the main news feed.
//
// The vertical is deliberately quiet. No auto-refresh every 15 seconds, no
// breaking banners, no "live" pulse — analytical content is not breaking
// news, and the cadence of the UI should match the cadence of the content.
//
// Shape: single unified stream. No category filter pills — every document
// from the full analytical establishment (think tanks, multilaterals,
// official sources, universities, media, data, conferences) lands in the
// same column, sorted most-recent-first. The category is surfaced *inside*
// each block so the user can tell at a glance what they're reading without
// needing to pre-filter.
//
// Data pipeline: useDepth → Basira /api/documents?shape=feed. If the engine
// is offline or has no analyzed docs yet, we surface that state explicitly
// so the user knows *why* they're looking at an empty column, and has a
// direct link to the engine's own UI for debugging.

import { useMemo, useState } from 'react';
import { useDepth } from '../../lib/useDepth';
import { DepthPost } from './DepthPost';
import { DepthCurate } from './DepthCurate';

function EmptyState({ status, reason, basiraUrl }) {
  // Map useDepth's machine-readable status/reason into something a human
  // (specifically: the operator) can act on. The goal is to never have
  // the depth tab look broken without explaining why.
  let title, body, hint;

  if (status === 'loading') {
    title = 'جاري تحميل الدراسات…';
    body = 'نقرأ الأبحاث والتحليلات من المحرك.';
  } else if (status === 'offline') {
    title = 'محرك بصيرة غير متاح';
    body = 'لم نتمكن من الوصول إلى محرك Basira. تأكد أنه يعمل محلياً على المنفذ 8000، أو عدّل VITE_BASIRA_URL.';
    hint = basiraUrl;
  } else if (status === 'error') {
    title = 'خطأ في المحرك';
    body = `استجاب المحرك بخطأ (${reason}). تحقق من السجلات.`;
    hint = basiraUrl;
  } else if (status === 'empty' && reason === 'no_documents_yet') {
    title = 'لا توجد وثائق بعد';
    body = 'المحرك يعمل لكنه لم يبتلع أي وثيقة حتى الآن. شغّل جولة استيعاب من لوحة العمليات.';
    hint = `${basiraUrl}/dashboard`;
  } else if (status === 'empty') {
    title = 'لا دراسات متاحة';
    body = 'لم يُرجع المحرك أي وثيقة. تحقق من السجلات أو أعد تشغيل جولة الاستيعاب.';
  } else {
    title = 'لا شيء هنا بعد';
    body = '';
  }

  return (
    <div className="depth-empty">
      <div className="depth-empty-title">{title}</div>
      {body && <div className="depth-empty-body">{body}</div>}
      {hint && (
        <a
          className="depth-empty-hint"
          href={hint}
          target="_blank"
          rel="noopener noreferrer"
        >
          {hint} ↗
        </a>
      )}
    </div>
  );
}

export function DepthFeed({ onOpen }) {
  const [showCurate, setShowCurate] = useState(false);
  const { items, status, reason, totalCount, basiraUrl } = useDepth({ limit: 80 });

  // Client-side sorting: always most-recent-first. Basira already sorts by
  // published_at desc, but items with null pub dates drop to the bottom of
  // our client list so the top stays informative.
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => (b.pubTs || 0) - (a.pubTs || 0));
  }, [items]);

  return (
    <div className="depth-root">
      {/* Intro strip — explains the vertical in one sentence so a first-time
          user understands it's not the same thing as the news feed. */}
      <div className="depth-intro">
        <div className="depth-intro-ar">
          قراءة هادئة ومعمّقة للعالم — أبحاث، تحليلات، وثائق رسمية، وتقارير
          منظمات دولية.
        </div>
        <div className="depth-intro-en">
          Not news. Structural analysis — what the arguments are actually saying
          once the institutional language is stripped.
        </div>
        {status === 'ok' && typeof totalCount === 'number' && (
          <div className="depth-count-bar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{sortedItems.length} دراسة من أصل {totalCount} في المحرك</span>
            <button
              onClick={() => setShowCurate(true)}
              style={{
                marginRight: 'auto', fontSize: 11, padding: '3px 10px',
                borderRadius: 6, border: '1px solid var(--g1)',
                background: 'var(--g05)', color: 'var(--t2)',
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              ⚙ Curate
            </button>
          </div>
        )}
      </div>

      {showCurate && <DepthCurate onClose={() => setShowCurate(false)} />}

      {/* Empty / loading / error states */}
      {(status !== 'ok' || sortedItems.length === 0) && (
        <EmptyState status={status} reason={reason} basiraUrl={basiraUrl} />
      )}

      {/* The feed proper — single unified stream, most-recent first */}
      {status === 'ok' && sortedItems.length > 0 && (
        <div className="depth-list">
          {sortedItems.map((item, i) => (
            <DepthPost
              key={item.id}
              item={item}
              index={i}
              delay={i < 20 ? i * 0.03 : 0}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}
