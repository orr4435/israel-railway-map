import { useState } from 'react';
import { X, LogIn, Loader2 } from 'lucide-react';
import { signIn } from '../lib/db';

interface Props {
  reason?: string;          // shown above the form, e.g. why sign-in is needed
  onClose: () => void;
  onSignedIn: () => void;
}

export function LoginModal({ reason, onClose, onSignedIn }: Props) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await signIn(email, password); onSignedIn(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><LogIn size={18} /> כניסת עורכים</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" title="סגור"><X size={18} /></button>
        </div>
        {reason && <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-2">{reason}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">שם משתמש או אימייל</label>
          <input type="text" required autoFocus autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} dir="ltr"
            placeholder="maor"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
          <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} dir="ltr"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} כניסה
        </button>
        <p className="text-xs text-gray-400">צפייה במפה פתוחה לכולם. הוספה ועריכה מותרות רק למשתמשים שהוגדרו כעורכים.</p>
      </form>
    </div>
  );
}
