import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { checkUsername } from '../../lib/supabase';
import { Sound } from '../../lib/sounds';
import { I } from '../shared/Icons';

export function ProfileSetup({ onClose }) {
  const { profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [usernameOk, setUsernameOk] = useState(null); // null=unchecked, true=available, false=taken
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleCheckUsername = async (val) => {
    const clean = val.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 20);
    setUsername(clean);
    setUsernameOk(null);
    if (clean.length < 3) { setUsernameOk(null); return; }
    const available = await checkUsername(clean);
    setUsernameOk(available);
  };

  const handleSave = async () => {
    if (!displayName.trim()) { setErr('الرجاء إدخال اسمك'); return; }
    if (username && username.length < 3) { setErr('اسم المستخدم يجب أن يكون ٣ أحرف على الأقل'); return; }
    if (username && usernameOk === false) { setErr('اسم المستخدم محجوز'); return; }

    setBusy(true);
    setErr(null);
    try {
      await updateProfile({
        display_name: displayName.trim(),
        username: username || null,
        bio: bio.trim() || null,
      });
      Sound.like();
      onClose();
    } catch {
      setErr('حدث خطأ، حاول مجدداً');
    }
    setBusy(false);
  };

  return (
    <div className="detail" style={{ background: 'var(--bg)', zIndex: 210 }}>
      <div className="det-hdr">
        <button className="ib" onClick={() => { Sound.close(); onClose(); }}>{I.back()}</button>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>إعداد الملف الشخصي</div>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ padding: '32px 24px', maxWidth: 400, margin: '0 auto' }}>
        {/* Avatar placeholder */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', background: 'var(--f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: 'var(--t3)', margin: '0 auto',
            border: '2px solid var(--g1)',
          }}>
            {displayName ? displayName[0] : '؟'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="auth-label">الاسم *</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="auth-input"
              placeholder="اسمك الظاهر"
              maxLength={50}
            />
          </div>

          <div>
            <label className="auth-label">اسم المستخدم</label>
            <input
              type="text"
              value={username}
              onChange={e => handleCheckUsername(e.target.value)}
              className="auth-input"
              placeholder="username (اختياري)"
              dir="ltr"
              style={{ textAlign: 'left' }}
              maxLength={20}
            />
            {username.length >= 3 && (
              <div style={{ fontSize: 11, marginTop: 4, color: usernameOk ? '#4CAF50' : usernameOk === false ? '#B71C1C' : 'var(--t4)' }}>
                {usernameOk === null ? 'جاري التحقق...' : usernameOk ? 'متاح ✓' : 'محجوز ✕'}
              </div>
            )}
          </div>

          <div>
            <label className="auth-label">نبذة</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              className="auth-input"
              placeholder="نبذة قصيرة عنك (اختياري)"
              rows={3}
              maxLength={200}
              style={{ resize: 'none' }}
            />
          </div>

          {err && (
            <div style={{ fontSize: 13, color: '#B71C1C', textAlign: 'center' }}>{err}</div>
          )}

          <button
            onClick={handleSave}
            disabled={busy}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: 'var(--bk)', color: '#fff', fontSize: 15, fontWeight: 700,
              fontFamily: 'var(--ft)', cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1, marginTop: 8,
            }}
          >
            {busy ? '...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}
