-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  صَدى (Sada) — Admin Curation Tables                            ║
-- ║  Run AFTER supabase-migration.sql                               ║
-- ║  These tables back the admin panel's curation features:        ║
-- ║    - article_overrides    : hide / pin / feature individual articles ║
-- ║    - radar_overrides      : pin / hide / add custom radar topics ║
-- ║    - manual_feed_items    : editorial feed items inserted by admins ║
-- ║    - curation_log         : audit trail (who did what, when) ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════
-- 1. ARTICLE OVERRIDES
-- ═══════════════════════════════════════════
-- Curation flags layered on top of RSS-fetched articles.
-- Keyed by article_id for transient ops (pin/feature) and by link
-- for permanent ops (hide) since article IDs rotate but URLs are stable.

CREATE TABLE IF NOT EXISTS article_overrides (
  article_id    TEXT PRIMARY KEY,
  link          TEXT,           -- backup match key
  hidden        BOOLEAN DEFAULT FALSE,
  pinned        BOOLEAN DEFAULT FALSE,   -- forces to top of feed
  featured      BOOLEAN DEFAULT FALSE,   -- highlighted card
  custom_title  TEXT,           -- override the headline
  custom_body   TEXT,           -- override the excerpt
  notes         TEXT,           -- internal admin notes
  updated_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_overrides_link ON article_overrides(link);
CREATE INDEX IF NOT EXISTS idx_article_overrides_hidden ON article_overrides(hidden) WHERE hidden = TRUE;
CREATE INDEX IF NOT EXISTS idx_article_overrides_pinned ON article_overrides(pinned) WHERE pinned = TRUE;

ALTER TABLE article_overrides ENABLE ROW LEVEL SECURITY;

-- Public read so anonymous /api/feeds can apply hides/pins. Writes go through
-- service-role-key in admin endpoints, so no client-side INSERT/UPDATE policy.
CREATE POLICY "article_overrides public read"
  ON article_overrides FOR SELECT USING (true);


-- ═══════════════════════════════════════════
-- 2. RADAR OVERRIDES
-- ═══════════════════════════════════════════
-- Manual edits to the radar topic list. Three actions:
--   pin    : always show this word (count is the blip size)
--   hide   : never show this word in the radar
--   add    : create a custom topic that doesn't exist in trending

CREATE TABLE IF NOT EXISTS radar_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word         TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('pin', 'hide', 'add')),
  weight       INT DEFAULT 5,         -- size hint for pin/add
  expires_at   TIMESTAMPTZ,           -- optional auto-removal
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(word, action)
);

CREATE INDEX IF NOT EXISTS idx_radar_overrides_action ON radar_overrides(action);
CREATE INDEX IF NOT EXISTS idx_radar_overrides_expires ON radar_overrides(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE radar_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "radar_overrides public read"
  ON radar_overrides FOR SELECT USING (true);


-- ═══════════════════════════════════════════
-- 3. MANUAL FEED ITEMS
-- ═══════════════════════════════════════════
-- Editorial articles created directly by admins. Inserted into /api/feeds
-- responses alongside RSS-fetched items, keyed by their own UUID.

CREATE TABLE IF NOT EXISTS manual_feed_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL CHECK (char_length(title) <= 500),
  body          TEXT CHECK (char_length(body) <= 5000),
  link          TEXT,
  image         TEXT,
  source_name   TEXT NOT NULL DEFAULT 'تحرير',
  source_initial TEXT NOT NULL DEFAULT 'ت',
  category      TEXT,
  is_breaking   BOOLEAN DEFAULT FALSE,
  pinned        BOOLEAN DEFAULT TRUE,    -- show at top by default
  expires_at    TIMESTAMPTZ,             -- auto-remove after this
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_feed_items_created ON manual_feed_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_feed_items_expires ON manual_feed_items(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE manual_feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_feed_items public read"
  ON manual_feed_items FOR SELECT
  USING (expires_at IS NULL OR expires_at > now());


-- ═══════════════════════════════════════════
-- 4. CURATION LOG
-- ═══════════════════════════════════════════
-- Append-only audit trail of every admin curation action.

CREATE TABLE IF NOT EXISTS curation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,                -- 'hide_article', 'pin_topic', 'create_item', etc.
  target_kind TEXT NOT NULL,                -- 'article', 'topic', 'manual_item'
  target_id   TEXT,                         -- article_id, topic word, or item UUID
  payload     JSONB,                        -- full action context
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curation_log_created ON curation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_curation_log_actor ON curation_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_curation_log_target ON curation_log(target_kind, target_id);

ALTER TABLE curation_log ENABLE ROW LEVEL SECURITY;

-- Audit log is admin-only — no public read policy. Service role writes.


-- ═══════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════
-- After running this:
--   1. Set ADMIN_USER_IDS env var in Cloudflare Pages dashboard
--      (comma-separated list of Supabase user UUIDs)
--   2. Deploy the new /api/admin/* endpoints
--   3. The admin panel News/Radar/Items tabs will start working
