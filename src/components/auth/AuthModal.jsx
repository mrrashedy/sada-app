import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Sound } from '../../lib/sounds';
import { I } from '../shared/Icons';

export function AuthModal({ onClose, onSuccess }) {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    if (mode === 'signup') {
      if (!name.trim()) { setErr('الرجاء إدخال اسمك'); setBusy(false); return; }
      if (password.length < 6) { setErr('كلمة المرور يجب أن تكون ٦ أحرف على الأقل'); setBusy(false); return; }
      const { error } = await signUp(email, password, name.trim());
      if (error) { setErr(mapError(error)); setBusy(false); return; }
    } else {
      const { error } = await signIn(email, password);
      if (error) { setErr(mapError(error)); setBusy(false); return; }
    }

    Sound.like();
    setBusy(false);
    onSuccess?.();
    onClose();
  };

  return (
    <div className="detail" style={{ background: 'var(--bg)', zIndex: 200 }}>
      <div className="det-hdr">
        <button className="ib" onClick={() => { Sound.close(); onClose(); }}>{I.back()}</button>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>
          {mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء حساب'}
        </div>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ padding: '32px 24px', maxWidth: 400, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--t1)', marginBottom: 8 }}>غرفة الأخبار</div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>
            {mode === 'signin' ? 'ادخل لمزامنة بياناتك عبر أجهزتك' : 'أنشئ حسابك للمزامنة والتفاعل'}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'signup' && (
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="الاسم"
              className="auth-input"
              autoComplete="name"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="البريد الإلكتروني"
            className="auth-input"
            autoComplete="email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="كلمة المرور"
            className="auth-input"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={6}
          />

          {err && (
            <div style={{ fontSize: 13, color: '#B71C1C', textAlign: 'center', padding: '8px 0' }}>{err}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: 'var(--bk)', color: '#fff', fontSize: 15, fontWeight: 700,
              fontFamily: 'var(--ft)', cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1, marginTop: 8,
            }}
          >
            {busy ? '...' : mode === 'signin' ? 'دخول' : 'إنشاء حساب'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setErr(null); }}
            style={{
              background: 'none', border: 'none', fontSize: 13, fontWeight: 600,
              color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--ft)',
            }}
          >
            {mode === 'signin' ? 'ليس لديك حساب؟ أنشئ واحداً' : 'لديك حساب؟ سجّل الدخول'}
          </button>
        </div>
      </div>
    </div>
  );
}

function mapError(msg) {
  if (!msg) return 'حدث خطأ';
  if (msg.includes('Invalid login')) return 'بريد أو كلمة مرور غير صحيحة';
  if (msg.includes('already registered')) return 'هذا البريد مسجّل مسبقاً';
  if (msg.includes('valid email')) return 'بريد إلكتروني غير صالح';
  if (msg.includes('least 6')) return 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل';
  if (msg.includes('rate limit')) return 'محاولات كثيرة، حاول لاحقاً';
  return msg;
}
