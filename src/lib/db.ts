import { createClient, type Session } from '@supabase/supabase-js';
import { Project, StoryPoint, ProjectType, GeoGeometry } from '../types';

// ── Supabase client (publishable key: safe in the browser, access is enforced by RLS) ──
// Defaults point at the production project (rail2). VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY override them;
// set VITE_DATA_SOURCE=sheets to fall back to the published Google Sheet.
const DEFAULT_URL = 'https://ldvptjhoswthnodevknt.supabase.co';
const DEFAULT_KEY = 'sb_publishable_zin7isT-7qftVTIPVBfg3w_WJHn8X9F';
const useSheets = (import.meta.env.VITE_DATA_SOURCE as string | undefined) === 'sheets';
const URL = useSheets ? '' : ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL);
const KEY = useSheets ? '' : ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_KEY);

export const supabaseEnabled = !!URL && !!KEY;
export const supabase = supabaseEnabled
  ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

function client() {
  if (!supabase) throw new Error('Supabase לא מוגדר');
  return supabase;
}

// ── Row mapping (snake_case columns ↔ app objects) ─────────────────────────────
type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : String(v));
const n = (v?: string) => (v && v.trim() ? v.trim() : null);

/** Dates are stored as SQL dates; anything that is not yyyy-mm-dd after normalising is rejected. */
function toSqlDate(v?: string): string | null {
  if (!v || !v.trim()) return null;
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  throw new Error(`תאריך לא תקין: ${t}`);
}

export function rowToProject(r: Row): Project {
  return {
    id:                     String(r.id),
    title:                  String(r.title ?? ''),
    projectType:            (s(r.project_type) as ProjectType) || undefined,
    location:               { lat: Number(r.lat) || 0, lng: Number(r.lng) || 0 },
    geometry:               (r.geometry as GeoGeometry | null) ?? undefined,
    targetYear:             s(r.target_year),
    cost:                   s(r.cost),
    trafficPurpose:         s(r.traffic_purpose),
    trafficStartDate:       s(r.traffic_start_date),
    trafficClosureDate:     s(r.traffic_end_date),
    trafficClosureDuration: s(r.traffic_closure_duration),
    locationName:           s(r.location_name),
    contacts:               s(r.contacts),
    department:             s(r.department),
    adminHead:              s(r.admin_head),
    arrangementStatus:      s(r.arrangement_status),
    initiator:              s(r.initiator),
    contractor:             s(r.contractor),
    managementCompany:      s(r.management_company),
    subProject:             s(r.sub_project),
    representative:         s(r.representative),
    blockageStatus:         s(r.blockage_status),
    image:                  s(r.image),
    notes:                  s(r.notes),
  };
}

function projectToRow(p: Omit<Project, 'id'>): Row {
  const hasCoords = p.location && !(p.location.lat === 0 && p.location.lng === 0);
  return {
    title:                    p.title,
    project_type:             p.projectType ?? 'אחר',
    lat:                      hasCoords ? p.location.lat : null,
    lng:                      hasCoords ? p.location.lng : null,
    geometry:                 p.geometry ?? null,
    target_year:              n(p.targetYear),
    cost:                     n(p.cost),
    traffic_purpose:          n(p.trafficPurpose),
    traffic_start_date:       toSqlDate(p.trafficStartDate),
    traffic_end_date:         toSqlDate(p.trafficClosureDate),
    traffic_closure_duration: n(p.trafficClosureDuration),
    location_name:            n(p.locationName),
    contacts:                 n(p.contacts),
    department:               n(p.department),
    admin_head:               n(p.adminHead),
    arrangement_status:       n(p.arrangementStatus),
    initiator:                n(p.initiator),
    contractor:               n(p.contractor),
    management_company:       n(p.managementCompany),
    sub_project:              n(p.subProject),
    representative:           n(p.representative),
    blockage_status:          n(p.blockageStatus),
    image:                    n(p.image),
    notes:                    n(p.notes),
  };
}

export function rowToStation(r: Row): StoryPoint {
  return {
    id:          String(r.id),
    title:       String(r.title ?? ''),
    description: String(r.description ?? ''),
    status:      String(r.status ?? 'אחר'),
    location:    { lat: Number(r.lat) || 0, lng: Number(r.lng) || 0 },
    geometry:    (r.geometry as GeoGeometry | null) ?? undefined,
    image:       s(r.image),
    link:        r.link_url ? { url: String(r.link_url), label: String(r.link_label || r.link_url) } : undefined,
  };
}

function stationToRow(st: Omit<StoryPoint, 'id'>): Row {
  return {
    title: st.title, description: st.description ?? '', status: st.status || 'אחר',
    lat: st.location.lat, lng: st.location.lng, geometry: st.geometry ?? null,
    image: n(st.image), link_url: n(st.link?.url), link_label: n(st.link?.label),
  };
}

// ── Reads (public) ─────────────────────────────────────────────────────────────
export async function loadProjects(): Promise<Project[]> {
  const { data, error } = await client().from('projects').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToProject);
}

export async function loadCustomStations(): Promise<StoryPoint[]> {
  const { data, error } = await client().from('stations').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToStation);
}

// ── Writes (editors only, enforced by the database) ───────────────────────────
function explain(message: string): Error {
  if (/[א-ת]/.test(message)) return new Error(message);   // our own Hebrew messages from the database functions
  if (/row-level security|permission denied/i.test(message)) return new Error('אין הרשאת עריכה. יש להתחבר עם משתמש עורך.');
  return new Error(message);
}

export async function saveProject(p: Omit<Project, 'id'>): Promise<Project> {
  const { data, error } = await client().from('projects').insert(projectToRow(p)).select().single();
  if (error) throw explain(error.message);
  return rowToProject(data);
}

export async function updateProject(p: Project): Promise<Project> {
  const { data, error } = await client().from('projects').update(projectToRow(p)).eq('id', p.id).select().single();
  if (error) throw explain(error.message);
  return rowToProject(data);
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await client().from('projects').delete().eq('id', id);
  if (error) throw explain(error.message);
}

export async function saveStation(st: Omit<StoryPoint, 'id'>): Promise<StoryPoint> {
  const { data, error } = await client().from('stations').insert(stationToRow(st)).select().single();
  if (error) throw explain(error.message);
  return rowToStation(data);
}

// ── Auth ───────────────────────────────────────────────────────────────────────
export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  return (await supabase.auth.getSession()).data.session;
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

/** Editors may sign in with a short username: "maor" means maor@vonomap.app. */
export const USERNAME_DOMAIN = 'vonomap.app';
export function toLoginEmail(userOrEmail: string): string {
  const v = userOrEmail.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${USERNAME_DOMAIN}`;
}

export async function signIn(userOrEmail: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email: toLoginEmail(userOrEmail), password });
  if (error) throw new Error(/invalid login/i.test(error.message) ? 'אימייל או סיסמה שגויים' : error.message);
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}

/** True when the signed-in user is listed in public.editors. */
export async function isEditor(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('is_editor');
  return !error && data === true;
}

// ── Roles: editor (add, edit, delete records) and superadmin (also manages editors) ──
export type Role = 'editor' | 'superadmin';

/** The signed-in user's role, or null for viewers. Works before the role column exists (falls back to is_editor). */
export async function myRole(): Promise<Role | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('is_superadmin');
  if (!error && data === true) return 'superadmin';
  return (await isEditor()) ? 'editor' : null;
}

export interface EditorRow { email: string; role: Role; has_login: boolean; last_sign_in_at: string | null }

// These call SECURITY DEFINER functions (supabase/setup_user_admin.sql) that check the caller is a superadmin.
export async function listEditors(): Promise<EditorRow[]> {
  const { data, error } = await client().rpc('admin_list_editors');
  if (error) throw explain(error.message);
  return (data ?? []) as EditorRow[];
}

/** Creates the editor with a login and password, or updates the role (and the password when one is given). */
export async function saveEditor(userOrEmail: string, password: string, role: Role): Promise<string> {
  const { data, error } = await client().rpc('admin_save_editor', { p_user: userOrEmail, p_password: password, p_role: role });
  if (error) throw explain(error.message);
  return String(data);
}

export async function setEditorPassword(email: string, password: string): Promise<void> {
  const { error } = await client().rpc('admin_set_password', { p_email: email, p_password: password });
  if (error) throw explain(error.message);
}

/** Removes the editor's rights and login account. */
export async function removeEditor(email: string): Promise<void> {
  const { error } = await client().rpc('admin_remove_editor', { p_email: email });
  if (error) throw explain(error.message);
}

/** Lets any signed-in user change their own password. */
export async function changeMyPassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
