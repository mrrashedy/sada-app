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

// ─── Profiles ───

export async function getProfile(userId) {
  if (!supabase || !userId) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

export async function updateProfile(userId, updates) {
  if (!supabase || !userId) return;
  await supabase.from('profiles').upsert({ id: userId, ...updates });
}

export async function checkUsername(username) {
  if (!supabase || !username) return false;
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  return !data; // true = available
}

// ─── Cloud Sync ───

export async function syncBookmarksToCloud(userId, localIds, allFeed) {
  if (!supabase || !userId || !localIds.size) return;
  const existing = await getBookmarks(userId);
  const existingIds = new Set(existing.map(b => b.article_id));
  const toAdd = [...localIds].filter(id => !existingIds.has(id));
  if (toAdd.length === 0) return;
  const rows = toAdd.map(id => {
    const item = allFeed.find(f => f.id === id);
    return { user_id: userId, article_id: id, article_data: item || null };
  });
  await supabase.from('bookmarks').upsert(rows);
}

export async function syncPreferencesToCloud(userId, prefs) {
  if (!supabase || !userId) return;
  await supabase.from('preferences').upsert({
    user_id: userId,
    sources: prefs.sources || {},
    dark_mode: prefs.dark_mode || false,
    interests: prefs.interests || {},
    topics: prefs.topics || [],
  });
}

export async function loadCloudData(userId) {
  if (!supabase || !userId) return null;
  const [bookmarks, prefs, profile] = await Promise.all([
    getBookmarks(userId),
    getPreferences(userId),
    getProfile(userId),
  ]);
  return { bookmarks, prefs, profile };
}

// ─── Reactions ───

export async function addReaction(userId, articleId, type = 'like') {
  if (!supabase || !userId) return;
  await supabase.from('reactions').upsert({ user_id: userId, article_id: articleId, reaction_type: type });
}

export async function removeReaction(userId, articleId, type = 'like') {
  if (!supabase || !userId) return;
  await supabase.from('reactions').delete()
    .eq('user_id', userId).eq('article_id', articleId).eq('reaction_type', type);
}

export async function getUserReactions(userId, articleIds) {
  if (!supabase || !userId || !articleIds.length) return [];
  const { data } = await supabase.from('reactions')
    .select('article_id, reaction_type')
    .eq('user_id', userId)
    .in('article_id', articleIds);
  return data || [];
}

export async function getReactionCounts(articleIds) {
  if (!supabase || !articleIds.length) return [];
  const { data } = await supabase.from('reaction_counts')
    .select('*')
    .in('article_id', articleIds);
  return data || [];
}

// ─── Comments ───

export async function getComments(articleId, { limit = 30, offset = 0 } = {}) {
  if (!supabase || !articleId) return [];
  const { data, error } = await supabase.from('comments')
    .select('*, profiles!comments_user_profiles_fk(display_name, username, avatar_url)')
    .eq('article_id', articleId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) console.error('[getComments] error:', error.message);
  return data || [];
}

export async function addComment(userId, articleId, body, parentId = null) {
  if (!supabase || !userId) return null;
  const { data: inserted, error } = await supabase.from('comments')
    .insert({ user_id: userId, article_id: articleId, body, parent_id: parentId })
    .select()
    .single();
  if (error) { console.error('[addComment] insert error:', error.message); return null; }
  // Fetch with profile join separately
  const { data } = await supabase.from('comments')
    .select('*, profiles!comments_user_profiles_fk(display_name, username, avatar_url)')
    .eq('id', inserted.id)
    .single();
  return data || inserted;
}

export async function deleteComment(commentId) {
  if (!supabase || !commentId) return;
  await supabase.from('comments').delete().eq('id', commentId);
}

export async function getCommentCount(articleIds) {
  if (!supabase || !articleIds.length) return {};
  const { data } = await supabase.from('reaction_counts')
    .select('article_id, comment_count')
    .in('article_id', articleIds);
  const map = {};
  (data || []).forEach(d => { map[d.article_id] = d.comment_count || 0; });
  return map;
}

// ─── Follows ───

export async function followUser(followerId, followingId) {
  if (!supabase || !followerId || !followingId) return;
  await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });
}

export async function unfollowUser(followerId, followingId) {
  if (!supabase || !followerId || !followingId) return;
  await supabase.from('follows').delete()
    .eq('follower_id', followerId).eq('following_id', followingId);
}

export async function getFollowers(userId, { limit = 30, offset = 0 } = {}) {
  if (!supabase || !userId) return [];
  const { data } = await supabase.from('follows')
    .select('follower_id, profiles:follower_id(id, display_name, username, avatar_url)')
    .eq('following_id', userId)
    .range(offset, offset + limit - 1);
  return data || [];
}

export async function getFollowing(userId, { limit = 30, offset = 0 } = {}) {
  if (!supabase || !userId) return [];
  const { data } = await supabase.from('follows')
    .select('following_id, profiles:following_id(id, display_name, username, avatar_url)')
    .eq('follower_id', userId)
    .range(offset, offset + limit - 1);
  return data || [];
}

export async function isFollowing(followerId, followingId) {
  if (!supabase || !followerId || !followingId) return false;
  const { data } = await supabase.from('follows')
    .select('follower_id')
    .eq('follower_id', followerId).eq('following_id', followingId)
    .maybeSingle();
  return !!data;
}

export async function searchProfiles(query, { limit = 10 } = {}) {
  if (!supabase || !query) return [];
  const { data } = await supabase.from('profiles')
    .select('id, display_name, username, avatar_url, bio, follower_count, following_count')
    .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
    .limit(limit);
  return data || [];
}
