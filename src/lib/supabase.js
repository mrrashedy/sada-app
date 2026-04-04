// Supabase client — handles auth, bookmarks, preferences
// Setup: create a free project at supabase.com, then add your keys to .env

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ─── Auth ───

export async function signUp(email, password) {
  if (!supabase) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { data, error: error?.message };
}

export async function signIn(email, password) {
  if (!supabase) return { error: 'Supabase not configured' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error: error?.message };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return () => subscription.unsubscribe();
}

// ─── Bookmarks ───

export async function getBookmarks(userId) {
  if (!supabase || !userId) return [];
  const { data } = await supabase
    .from('bookmarks')
    .select('article_id, article_data, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function addBookmark(userId, articleId, articleData) {
  if (!supabase || !userId) return;
  await supabase.from('bookmarks').upsert({
    user_id: userId,
    article_id: articleId,
    article_data: articleData,
  });
}

export async function removeBookmark(userId, articleId) {
  if (!supabase || !userId) return;
  await supabase.from('bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('article_id', articleId);
}

// ─── User Preferences ───

export async function getPreferences(userId) {
  if (!supabase || !userId) return null;
  const { data } = await supabase
    .from('preferences')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data;
}

export async function savePreferences(userId, prefs) {
  if (!supabase || !userId) return;
  await supabase.from('preferences').upsert({
    user_id: userId,
    ...prefs,
  });
}

// ─── SQL to create tables (run in Supabase SQL editor) ───
/*

-- Bookmarks table
CREATE TABLE bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL,
  article_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, article_id)
);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own bookmarks" ON bookmarks
  FOR ALL USING (auth.uid() = user_id);

-- Preferences table
CREATE TABLE preferences (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  sources JSONB DEFAULT '{}',
  notifications BOOLEAN DEFAULT true,
  dark_mode BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own prefs" ON preferences
  FOR ALL USING (auth.uid() = user_id);

*/
