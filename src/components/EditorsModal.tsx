import { useEffect, useState } from 'react';
import { X, Users, Trash2, Loader2, UserPlus, ShieldCheck } from 'lucide-react';
import * as db from '../lib/db';

interface Props { myEmail: string; onClose: () => void }

const short = (email: string) => email.replace(`@${db.USERNAME_DOMAIN}`, '');

export function EditorsModal({ myEmail, onClose }: Props) {
  const [rows, setRows]       = useState<db.EditorRow[] | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [newUser, setNewUser] = useState('');
  const [newRole, setNewRole] = useState<db.Role>('editor');
  const [busy, setBusy]       = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);   // email waiting for a second click to remove

  const load = async () => {
    try { setRows(await db.listEditors()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { load(); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); setConfirm(null); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Users size={18} /> ניהול עורכים</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" title="סגור"><X size={18} /></button>
        </div>

        {rows === null && !error && <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> טוען…</p>}

        {rows && (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 text-right border-b"><th className="py-1.5 font-semibold">משתמש</th><th className="font-semibold">הרשאה</th><th /></tr></thead>
            <tbody>
              {rows.map(r => {
                const me = r.email.toLowerCase() === myEmail.toLowerCase();
                return (
                  <tr key={r.email} className="border-b border-gray-100">
                    <td className="py-2" dir="ltr" style={{ textAlign: 'right' }}>{short(r.email)}{me && <span className="text-xs text-gray-400"> (את/ה)</span>}</td>
                    <td>
                      <select value={r.role} disabled={busy || me}
                        onChange={e => run(() => db.upsertEditor(r.email, e.target.value as db.Role))}
                        className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white">
                        <option value="editor">עורך</option>
                        <option value="superadmin">מנהל על</option>
                      </select>
                    </td>
                    <td className="text-left">
                      {!me && (confirm === r.email ? (
                        <button disabled={busy} onClick={() => run(() => db.removeEditor(r.email))}
                          className="text-xs text-white bg-red-600 rounded px-2 py-1 hover:bg-red-700">לאשר הסרה</button>
                      ) : (
                        <button disabled={busy} onClick={() => setConfirm(r.email)} title="הסר"
                          className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <form className="flex gap-2 items-end" onSubmit={e => { e.preventDefault(); if (newUser.trim()) run(async () => { await db.upsertEditor(newUser, newRole); setNewUser(''); }); }}>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">שם משתמש או אימייל</label>
            <input value={newUser} onChange={e => setNewUser(e.target.value)} dir="ltr" placeholder="dana"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={newRole} onChange={e => setNewRole(e.target.value as db.Role)} className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white">
            <option value="editor">עורך</option>
            <option value="superadmin">מנהל על</option>
          </select>
          <button type="submit" disabled={busy || !newUser.trim()}
            className="flex items-center gap-1 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <UserPlus size={14} /> הוסף
          </button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
          <p className="flex items-center gap-1 font-semibold text-gray-600"><ShieldCheck size={13} /> איך מוסיפים עורך חדש</p>
          <p>1. מוסיפים כאן את שם המשתמש. "dana" הופך ל-dana@{db.USERNAME_DOMAIN}.</p>
          <p>2. יוצרים לו משתמש עם סיסמה ב-Supabase: Authentication › Users › Add user, עם Auto Confirm.</p>
          <p>עורך יכול להוסיף, לערוך ולמחוק. מנהל על יכול גם לנהל את רשימת העורכים.</p>
        </div>
      </div>
    </div>
  );
}
