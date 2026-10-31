import { useEffect, useState } from 'react';
import { X, Users, Trash2, Loader2, UserPlus, KeyRound, Eye, EyeOff, Shuffle, CheckCircle2, AlertCircle } from 'lucide-react';
import * as db from '../lib/db';

interface Props { myEmail: string; onClose: () => void }

const short = (email: string) => email.replace(`@${db.USERNAME_DOMAIN}`, '');

/** Readable random password: letters and digits, no look-alike characters. */
function randomPassword(len = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(len); crypto.getRandomValues(a);
  return Array.from(a, n => chars[n % chars.length]).join('');
}

function PasswordInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex-1">
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} dir="ltr"
        autoComplete="new-password" autoFocus={autoFocus} placeholder="לפחות 6 תווים"
        className="w-full pl-16 pr-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex gap-1 text-gray-400">
        <button type="button" onClick={() => setShow(s => !s)} title={show ? 'הסתר' : 'הצג'} className="p-0.5 hover:text-gray-700">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button type="button" onClick={() => { onChange(randomPassword()); setShow(true); }} title="צור סיסמה אקראית" className="p-0.5 hover:text-gray-700">
          <Shuffle size={14} />
        </button>
      </div>
    </div>
  );
}

export function EditorsModal({ myEmail, onClose }: Props) {
  const [rows, setRows]       = useState<db.EditorRow[] | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [notice, setNotice]   = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState<db.Role>('editor');
  const [confirm, setConfirm] = useState<string | null>(null);       // email waiting for a second click to remove
  const [pwFor, setPwFor]     = useState<string | null>(null);       // email whose password is being set
  const [pwValue, setPwValue] = useState('');

  const load = async () => {
    try { setRows(await db.listEditors()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { load(); }, []);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setError(null); setNotice(null);
    try { const msg = await fn(); if (msg) setNotice(msg); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); setConfirm(null); }
  };

  const savePassword = (r: db.EditorRow) => run(async () => {
    if (pwValue.length < 6) throw new Error('הסיסמה חייבת להכיל לפחות 6 תווים');
    if (r.has_login) await db.setEditorPassword(r.email, pwValue);
    else await db.saveEditor(r.email, pwValue, r.role);
    setPwFor(null); setPwValue('');
    return r.has_login ? `הסיסמה של ${short(r.email)} עודכנה` : `נוצר חשבון כניסה ל-${short(r.email)}`;
  });

  const addEditor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.trim()) return;
    run(async () => {
      if (newPass.length < 6) throw new Error('יש להזין סיסמה של לפחות 6 תווים');
      const email = await db.saveEditor(newUser, newPass, newRole);
      setNewUser(''); setNewPass('');
      return `${short(email)} נוסף. הוא יכול להתחבר עכשיו עם שם המשתמש "${short(email)}" והסיסמה שהוזנה.`;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Users size={18} /> ניהול עורכים</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" title="סגור"><X size={18} /></button>
        </div>

        {rows === null && !error && <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> טוען…</p>}

        {rows && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 text-right border-b">
                <th className="py-1.5 font-semibold">משתמש</th><th className="font-semibold">הרשאה</th><th className="font-semibold">כניסה</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const me = r.email.toLowerCase() === myEmail.toLowerCase();
                return (
                  <tr key={r.email} className="border-b border-gray-100 align-top">
                    <td className="py-2" dir="ltr" style={{ textAlign: 'right' }}>
                      {short(r.email)}{me && <span className="text-xs text-gray-400"> (את/ה)</span>}
                      {pwFor === r.email && (
                        <div className="flex gap-1.5 mt-2" dir="rtl">
                          <PasswordInput value={pwValue} onChange={setPwValue} autoFocus />
                          <button disabled={busy} onClick={() => savePassword(r)}
                            className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                            {r.has_login ? 'שמור סיסמה' : 'צור כניסה'}
                          </button>
                          <button onClick={() => { setPwFor(null); setPwValue(''); }} className="text-xs px-2 text-gray-500 hover:text-gray-800">ביטול</button>
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      <select value={r.role} disabled={busy || me}
                        onChange={e => run(async () => { await db.saveEditor(r.email, '', e.target.value as db.Role); })}
                        className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white">
                        <option value="editor">עורך</option>
                        <option value="superadmin">מנהל על</option>
                      </select>
                    </td>
                    <td className="py-2 text-xs">
                      {r.has_login
                        ? <span className="inline-flex items-center gap-1 text-green-700" title={r.last_sign_in_at ? `כניסה אחרונה: ${new Date(r.last_sign_in_at).toLocaleString('he-IL')}` : 'עוד לא התחבר'}>
                            <CheckCircle2 size={12} /> {r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleDateString('he-IL') : 'טרם התחבר'}
                          </span>
                        : <span className="inline-flex items-center gap-1 text-amber-700"><AlertCircle size={12} /> אין סיסמה</span>}
                    </td>
                    <td className="py-1.5 text-left whitespace-nowrap">
                      <button disabled={busy} onClick={() => { setPwFor(r.email); setPwValue(''); }}
                        title={r.has_login ? 'איפוס סיסמה' : 'הגדרת סיסמה'} className="text-gray-400 hover:text-blue-600 p-1"><KeyRound size={15} /></button>
                      {!me && (confirm === r.email ? (
                        <button disabled={busy} onClick={() => run(async () => { await db.removeEditor(r.email); return `${short(r.email)} הוסר`; })}
                          className="text-xs text-white bg-red-600 rounded px-2 py-1 hover:bg-red-700">לאשר הסרה</button>
                      ) : (
                        <button disabled={busy} onClick={() => setConfirm(r.email)} title="הסר עורך"
                          className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <form className="space-y-2 border border-gray-100 rounded-lg p-3 bg-gray-50" onSubmit={addEditor}>
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><UserPlus size={14} /> הוספת עורך</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[9rem]">
              <label className="block text-xs font-medium text-gray-600 mb-1">שם משתמש או אימייל</label>
              <input value={newUser} onChange={e => setNewUser(e.target.value)} dir="ltr" placeholder="dana" autoComplete="off"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex-1 min-w-[11rem]">
              <label className="block text-xs font-medium text-gray-600 mb-1">סיסמה</label>
              <PasswordInput value={newPass} onChange={setNewPass} />
            </div>
            <select value={newRole} onChange={e => setNewRole(e.target.value as db.Role)} className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white">
              <option value="editor">עורך</option>
              <option value="superadmin">מנהל על</option>
            </select>
            <button type="submit" disabled={busy || !newUser.trim()}
              className="flex items-center gap-1 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} הוסף
            </button>
          </div>
        </form>

        {notice && <p className="text-sm text-green-700 bg-green-50 rounded-lg p-2">{notice}</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}

        <div className="text-xs text-gray-500 space-y-1">
          <p>שם משתמש קצר כמו "dana" הופך ל-dana@{db.USERNAME_DOMAIN}. אפשר גם להזין אימייל מלא.</p>
          <p>מעבירים לעורך את שם המשתמש והסיסמה. לאיפוס סיסמה לוחצים על סמל המפתח בשורה שלו.</p>
          <p>עורך מוסיף, עורך ומוחק רשומות. מנהל על יכול גם לנהל את רשימת העורכים.</p>
        </div>
      </div>
    </div>
  );
}
