-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  صَدى (Sada) — Complete Database Migration                     ║
-- ║  Run this ONCE in Supabase SQL Editor (supabase.com → SQL)     ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════
-- 1. PROFILES
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE,
  avatar_url TEXT,
  bio TEXT DEFAULT '',
  follower_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════
-- 2. BOOKMARKS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  article_id TEXT NOT NULL,
  article_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own bookmarks"
  ON bookmarks FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════
-- 3. PREFERENCES
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS preferences (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  sources JSONB DEFAULT '{}',
  topics JSONB DEFAULT '[]',
  interests JSONB DEFAULT '{}',
  notifications BOOLEAN DEFAULT true,
  dark_mode BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own prefs"
  ON preferences FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════
-- 4. REACTIONS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  article_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, article_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_reactions_article ON reactions(article_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON reactions(user_id);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view reactions"
  ON reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can react"
  ON reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own reactions"
  ON reactions FOR DELETE USING (auth.uid() = user_id);

-- Materialized counts for fast reads
CREATE TABLE IF NOT EXISTS reaction_counts (
  article_id TEXT PRIMARY KEY,
  like_count INT DEFAULT 0,
  insightful_count INT DEFAULT 0,
  important_count INT DEFAULT 0,
  misleading_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reaction_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read counts"
  ON reaction_counts FOR SELECT USING (true);
-- Service role handles writes via triggers
CREATE POLICY "System can manage counts"
  ON reaction_counts FOR ALL USING (true);

-- Trigger: auto-update reaction counts
CREATE OR REPLACE FUNCTION update_reaction_counts()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO reaction_counts (article_id, updated_at)
    VALUES (NEW.article_id, now())
    ON CONFLICT (article_id) DO NOTHING;

    IF NEW.reaction_type = 'like' THEN
      UPDATE reaction_counts SET like_count = like_count + 1, updated_at = now() WHERE article_id = NEW.article_id;
    ELSIF NEW.reaction_type = 'insightful' THEN
      UPDATE reaction_counts SET insightful_count = insightful_count + 1, updated_at = now() WHERE article_id = NEW.article_id;
    ELSIF NEW.reaction_type = 'important' THEN
      UPDATE reaction_counts SET important_count = important_count + 1, updated_at = now() WHERE article_id = NEW.article_id;
    ELSIF NEW.reaction_type = 'misleading' THEN
      UPDATE reaction_counts SET misleading_count = misleading_count + 1, updated_at = now() WHERE article_id = NEW.article_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.reaction_type = 'like' THEN
      UPDATE reaction_counts SET like_count = GREATEST(like_count - 1, 0), updated_at = now() WHERE article_id = OLD.article_id;
    ELSIF OLD.reaction_type = 'insightful' THEN
      UPDATE reaction_counts SET insightful_count = GREATEST(insightful_count - 1, 0), updated_at = now() WHERE article_id = OLD.article_id;
    ELSIF OLD.reaction_type = 'important' THEN
      UPDATE reaction_counts SET important_count = GREATEST(important_count - 1, 0), updated_at = now() WHERE article_id = OLD.article_id;
    ELSIF OLD.reaction_type = 'misleading' THEN
      UPDATE reaction_counts SET misleading_count = GREATEST(misleading_count - 1, 0), updated_at = now() WHERE article_id = OLD.article_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_reaction_change ON reactions;
CREATE TRIGGER on_reaction_change
  AFTER INSERT OR DELETE ON reactions
  FOR EACH ROW EXECUTE FUNCTION update_reaction_counts();

-- ═══════════════════════════════════════════
-- 5. COMMENTS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  article_id TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view comments"
  ON comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment"
  ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can edit own comments"
  ON comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE USING (auth.uid() = user_id);

-- Auto-update comment_count in reaction_counts
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO reaction_counts (article_id, comment_count, updated_at)
    VALUES (NEW.article_id, 1, now())
    ON CONFLICT (article_id) DO UPDATE SET comment_count = reaction_counts.comment_count + 1, updated_at = now();
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE reaction_counts SET comment_count = GREATEST(comment_count - 1, 0), updated_at = now() WHERE article_id = OLD.article_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_change ON comments;
CREATE TRIGGER on_comment_change
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_count();

-- ═══════════════════════════════════════════
-- 6. FOLLOWS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can see follows"
  ON follows FOR SELECT USING (true);
CREATE POLICY "Users can follow"
  ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE USING (auth.uid() = follower_id);

-- Auto-maintain follow counts
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE profiles SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.following_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_follow_change ON follows;
CREATE TRIGGER on_follow_change
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- ═══════════════════════════════════════════
-- 7. ACTIVITY FEED
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type TEXT NOT NULL,         -- 'reaction', 'comment', 'follow', 'reply'
  target_type TEXT NOT NULL,         -- 'article', 'comment', 'user'
  target_id TEXT NOT NULL,           -- article_id, comment_id, or user_id
  target_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- who gets notified
  metadata JSONB DEFAULT '{}',       -- article title, comment preview, etc.
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity(target_owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_read ON activity(target_owner_id, read) WHERE NOT read;

ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own activity"
  ON activity FOR SELECT USING (auth.uid() = target_owner_id OR auth.uid() = actor_id);
CREATE POLICY "System can insert activity"
  ON activity FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can mark own as read"
  ON activity FOR UPDATE USING (auth.uid() = target_owner_id);

-- Auto-create activity on reaction
CREATE OR REPLACE FUNCTION create_reaction_activity()
RETURNS trigger AS $$
BEGIN
  -- Don't notify yourself
  INSERT INTO activity (actor_id, action_type, target_type, target_id, metadata)
  VALUES (
    NEW.user_id,
    'reaction',
    'article',
    NEW.article_id,
    jsonb_build_object('reaction_type', NEW.reaction_type)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_reaction_activity ON reactions;
CREATE TRIGGER on_reaction_activity
  AFTER INSERT ON reactions
  FOR EACH ROW EXECUTE FUNCTION create_reaction_activity();

-- Auto-create activity on comment
CREATE OR REPLACE FUNCTION create_comment_activity()
RETURNS trigger AS $$
DECLARE
  parent_owner UUID;
BEGIN
  -- If replying to someone, notify the parent comment owner
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_owner FROM comments WHERE id = NEW.parent_id;
    IF parent_owner IS NOT NULL AND parent_owner != NEW.user_id THEN
      INSERT INTO activity (actor_id, action_type, target_type, target_id, target_owner_id, metadata)
      VALUES (
        NEW.user_id, 'reply', 'comment', NEW.id::TEXT, parent_owner,
        jsonb_build_object('body_preview', left(NEW.body, 100), 'article_id', NEW.article_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_activity ON comments;
CREATE TRIGGER on_comment_activity
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION create_comment_activity();

-- Auto-create activity on follow
CREATE OR REPLACE FUNCTION create_follow_activity()
RETURNS trigger AS $$
BEGIN
  INSERT INTO activity (actor_id, action_type, target_type, target_id, target_owner_id)
  VALUES (NEW.follower_id, 'follow', 'user', NEW.following_id::TEXT, NEW.following_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_follow_activity ON follows;
CREATE TRIGGER on_follow_activity
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION create_follow_activity();

-- ═══════════════════════════════════════════
-- 8. ARTICLE SUMMARIES (AI cache)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS article_summaries (
  article_id TEXT PRIMARY KEY,
  summary_ar TEXT NOT NULL,
  model TEXT DEFAULT 'workers-ai',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE article_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read summaries"
  ON article_summaries FOR SELECT USING (true);
CREATE POLICY "System can write summaries"
  ON article_summaries FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update summaries"
  ON article_summaries FOR UPDATE USING (true);

-- ═══════════════════════════════════════════
-- 9. ENABLE REALTIME
-- ═══════════════════════════════════════════

-- Enable realtime for comments (live discussions)
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
-- Enable realtime for activity (live notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE activity;

-- ═══════════════════════════════════════════
-- 10. STORAGE BUCKET FOR AVATARS
-- ═══════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Authenticated users can upload avatar"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND auth.role() = 'authenticated'
  );
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE USING (
    bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ═══════════════════════════════════════════
-- DONE! Your database is ready.
-- ═══════════════════════════════════════════
