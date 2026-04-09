import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getProfile, followUser, unfollowUser, isFollowing as checkFollowing, getFollowers, getFollowing } from '../../lib/supabase';
import { Sound } from '../../lib/sounds';
import { I } from '../shared/Icons';

export function UserProfile({ userId, onClose, onOpenAuth }) {
  const { user, isLoggedIn } = useAuth();
  const [profile, setProfile] = useState(null);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info'); // 'info' | 'followers' | 'following'
  const [followers, setFollowers] = useState([]);
  const [followingList, setFollowingList] = useState([]);

  const isOwn = user?.id === userId;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getProfile(userId).then(p => {
      setProfile(p);
      setLoading(false);
    }).catch(() => setLoading(false));

    if (isLoggedIn && !isOwn) {
      checkFollowing(user.id, userId).then(setFollowing).catch(() => {});
    }
  }, [userId, isLoggedIn]);

  const handleFollow = async () => {
    if (!isLoggedIn) { onOpenAuth?.(); return; }
    Sound.tap();
    if (following) {
      await unfollowUser(user.id, userId);
      setFollowing(false);
      setProfile(p => p ? { ...p, follower_count: Math.max(0, (p.follower_count || 0) - 1) } : p);
    } else {
      await followUser(user.id, userId);
      setFollowing(true);
      setProfile(p => p ? { ...p, follower_count: (p.follower_count || 0) + 1 } : p);
    }
  };

  const loadFollowers = async () => {
    setTab('followers');
    const data = await getFollowers(userId);
    setFollowers(data.map(d => d.profiles).filter(Boolean));
  };

  const loadFollowing = async () => {
    setTab('following');
    const data = await getFollowing(userId);
    setFollowingList(data.map(d => d.profiles).filter(Boolean));
  };

  if (loading) return (
    <div className="detail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 24, height: 24, border: '2px solid var(--g2)', borderTopColor: 'var(--t3)', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
    </div>
  );

  if (!profile) return (
    <div className="detail">
      <div className="det-hdr">
        <button className="ib" onClick={() => { Sound.close(); onClose(); }}>{I.back()}</button>
      </div>
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--t4)' }}>لم يتم العثور على الملف الشخصي</div>
    </div>
  );

  return (
    <div className="detail">
      <div className="det-hdr">
        <button className="ib" onClick={() => { Sound.close(); onClose(); }}>{I.back()}</button>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>الملف الشخصي</div>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ padding: '24px', textAlign: 'center' }}>
        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 14px',
          background: 'var(--rd)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 800, color: '#fff',
        }}>
          {(profile.display_name || '?')[0]}
        </div>

        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)', marginBottom: 4 }}>{profile.display_name}</div>
        {profile.username && <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 8 }}>@{profile.username}</div>}
        {profile.bio && <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 16, maxWidth: 300, margin: '0 auto 16px' }}>{profile.bio}</div>}

        {/* Stats */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 20 }}>
          <button onClick={loadFollowers} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ft)', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{profile.follower_count || 0}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>متابِع</div>
          </button>
          <button onClick={loadFollowing} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ft)', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{profile.following_count || 0}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>يُتابع</div>
          </button>
        </div>

        {/* Follow button */}
        {!isOwn && (
          <button onClick={handleFollow} style={{
            padding: '10px 32px', borderRadius: 24, fontSize: 14, fontWeight: 700,
            fontFamily: 'var(--ft)', cursor: 'pointer', transition: 'all .2s',
            background: following ? 'none' : 'var(--bk)', color: following ? 'var(--t2)' : '#fff',
            border: following ? '1px solid var(--g2)' : 'none',
          }}>
            {following ? 'إلغاء المتابعة' : 'متابعة'}
          </button>
        )}
      </div>

      {/* Followers/Following list */}
      {tab !== 'info' && (
        <div style={{ borderTop: '.5px solid var(--g1)' }}>
          <div style={{ display: 'flex', borderBottom: '.5px solid var(--g1)' }}>
            <button onClick={() => setTab('info')} style={{ flex: 1, padding: '12px', background: 'none', border: 'none', fontSize: 13, fontWeight: 600, color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--ft)' }}>← رجوع</button>
            <div style={{ flex: 2, padding: '12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
              {tab === 'followers' ? 'المتابِعون' : 'يُتابع'}
            </div>
            <div style={{ flex: 1 }} />
          </div>
          {(tab === 'followers' ? followers : followingList).map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '.5px solid var(--g1)' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'var(--t2)', flexShrink: 0 }}>
                {(p.display_name || '?')[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{p.display_name}</div>
                {p.username && <div style={{ fontSize: 12, color: 'var(--t3)' }}>@{p.username}</div>}
              </div>
            </div>
          ))}
          {(tab === 'followers' ? followers : followingList).length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--t4)', fontSize: 13 }}>لا يوجد</div>
          )}
        </div>
      )}
    </div>
  );
}
