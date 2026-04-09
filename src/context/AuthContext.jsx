import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  supabase, signUp as sbSignUp, signIn as sbSignIn, signOut as sbSignOut,
  onAuthChange, getProfile, updateProfile as sbUpdateProfile,
  loadCloudData, syncBookmarksToCloud, syncPreferencesToCloud,
} from '../lib/supabase';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Listen for auth changes
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      setUser(u);
      if (u) loadProfile(u.id);
      else setLoading(false);
    });

    return onAuthChange(u => {
      setUser(u);
      if (u) loadProfile(u.id);
      else { setProfile(null); setLoading(false); }
    });
  }, []);

  const loadProfile = async (uid) => {
    const p = await getProfile(uid);
    setProfile(p);
    // If no username set, show profile setup
    if (p && !p.username) setNeedsSetup(true);
    else setNeedsSetup(false);
    setLoading(false);
  };

  const signUp = useCallback(async (email, password, displayName) => {
    const { data, error } = await sbSignUp(email, password);
    if (error) return { error };
    // Update display name in profile after signup trigger creates it
    if (data?.user) {
      // Small delay for the DB trigger to create the profile row
      await new Promise(r => setTimeout(r, 500));
      await sbUpdateProfile(data.user.id, { display_name: displayName || '' });
      setNeedsSetup(true);
    }
    return { data, error: null };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const result = await sbSignIn(email, password);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await sbSignOut();
    setUser(null);
    setProfile(null);
  }, []);

  const updateProfile = useCallback(async (updates) => {
    if (!user) return;
    await sbUpdateProfile(user.id, updates);
    setProfile(prev => ({ ...prev, ...updates }));
    if (updates.username) setNeedsSetup(false);
  }, [user]);

  // Sync local data to cloud on first login
  const syncToCloud = useCallback(async (localData, allFeed) => {
    if (!user) return;
    try {
      if (localData.bookmarkIds?.size > 0) {
        await syncBookmarksToCloud(user.id, localData.bookmarkIds, allFeed);
      }
      if (localData.interests || localData.topics) {
        await syncPreferencesToCloud(user.id, {
          interests: localData.interests || {},
          topics: localData.topics || [],
          dark_mode: localData.theme === 'dark',
        });
      }
    } catch (e) {
      console.warn('[auth] sync failed:', e.message);
    }
  }, [user]);

  // Load cloud data (bookmarks, prefs) for merging into app state
  const loadCloud = useCallback(async () => {
    if (!user) return null;
    return loadCloudData(user.id);
  }, [user]);

  return (
    <AuthCtx.Provider value={{
      user, profile, loading, needsSetup,
      signUp, signIn, signOut, updateProfile,
      syncToCloud, loadCloud,
      isLoggedIn: !!user,
      hasSupabase: !!supabase,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) return { isLoggedIn: false, hasSupabase: false, loading: false, user: null, profile: null };
  return ctx;
}
