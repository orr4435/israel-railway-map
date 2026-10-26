import React, { useState, useEffect, useMemo } from 'react';
import { Map } from './components/Map';
import { StoryPanel } from './components/StoryPanel';
import { StoryPoint, Project, RailSegment } from './types';
import { Plus, Maximize2, Minimize2, CloudOff, Cloud, Loader2, Database, LogIn, LogOut, Users } from 'lucide-react';
import { AddStationForm } from './components/AddStationForm';
import { AddProjectForm } from './components/AddProjectForm';
import {
  sheetsEnabled, canWrite,
  loadProjects, saveProject,
  loadCustomStations, saveStation,
  diagnoseSheets, type SheetsDiag,
} from './lib/sheets';
import * as db from './lib/db';
import { LoginModal } from './components/LoginModal';
import { EditorsModal } from './components/EditorsModal';
import { resolveTrafficLocations } from './lib/traffic';

type SyncStatus = 'idle' | 'loading' | 'ok' | 'error';

function App() {
  const [points,        setPoints]        = useState<StoryPoint[]>([]);
  const [activePoint,   setActivePoint]   = useState<StoryPoint | undefined>();
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | undefined>();
  const [segments,      setSegments]      = useState<RailSegment[]>([]);
  const [activeSegment, setActiveSegment] = useState<RailSegment | undefined>();
  const [statusGeoJSON, setStatusGeoJSON] = useState<any>(null);
  const [isExpanded,    setIsExpanded]    = useState(false);
  const [showAddStation,  setShowAddStation]  = useState(false);
  const [showAddProject,  setShowAddProject]  = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [syncStatus,    setSyncStatus]    = useState<SyncStatus>('idle');
  const [diag,          setDiag]          = useState<SheetsDiag | null>(null);

  // Supabase is the data source when it is configured; Google Sheets stays as the fallback
  const useDb = db.supabaseEnabled;
  const [userEmail,  setUserEmail]  = useState<string | null>(null);
  const [role,       setRole]       = useState<db.Role | null>(null);
  const editor = role !== null;
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showEditors,    setShowEditors]    = useState(false);
  const [login,      setLogin]      = useState<{ reason?: string; then?: () => void } | null>(null);

  useEffect(() => {
    if (!useDb) return;
    const apply = async (email: string | null) => {
      setUserEmail(email);
      setRole(email ? await db.myRole() : null);
    };
    db.getSession().then(s => apply(s?.user.email ?? null));
    return db.onAuthChange(s => { apply(s?.user.email ?? null); });
  }, [useDb]);

  /** Runs an editing action, asking the user to sign in first when needed. */
  const requireEditor = (action: () => void) => {
    if (!useDb || editor) { action(); return; }
    setLogin({
      reason: userEmail ? `המשתמש ${userEmail} אינו מוגדר כעורך. יש להתחבר עם משתמש עורך.` : 'כדי להוסיף או לערוך יש להתחבר כעורך.',
      then: action,
    });
  };

  // Traffic arrangements without coordinates are placed on the station named in their "מיקום" field
  const resolvedProjects = useMemo(() => resolveTrafficLocations(projects, points), [projects, points]);

  useEffect(() => {
    fetchStations();
    fetchSegments();
    if (db.supabaseEnabled) { fetchFromDb(); return; }   // blockages live in the database too
    const sheetsPromise = sheetsEnabled ? fetchFromSheets() : Promise.resolve();
    sheetsPromise.finally(() => fetchStaticBlockages());
  }, []);

  // ── GeoJSON loaders ────────────────────────────────────────────────────────

  const fetchStations = async () => {
    try {
      const res = await fetch('/station.geojson');
      if (!res.ok) throw new Error();
      const geo = await res.json();
      const pts: StoryPoint[] = geo.features
        .filter((f: any) => f.geometry?.type === 'Point')
        .map((f: any) => ({
          id:          String(f.properties.OBJECTID || f.properties.MAAGAN_ID),
          title:       f.properties.ASSET_NAME,
          status:      f.properties.STATUS_1 || 'אחר',
          description: f.properties.STATUS_1 || 'לא ידוע',
          location:    { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
        }));
      setPoints(pts);
      if (pts.length > 0) setActivePoint(pts[0]);
    } catch {
      setError('שגיאה בטעינת נתוני התחנות');
    }
  };

  const fetchSegments = async () => {
    try {
      const res = await fetch('/status.geojson');
      if (!res.ok) throw new Error();
      const geo = await res.json();
      setStatusGeoJSON(geo);

      const segs: RailSegment[] = geo.features
        .filter((f: any) => f.geometry?.type === 'LineString')
        .map((f: any) => {
          const p     = f.properties;
          const coords: number[][] = f.geometry.coordinates;
          const mid   = coords[Math.floor(coords.length / 2)];
          return {
            id:         String(p.OBJECTID),
            note:       p.NOTE       || 'לא ידוע',
            statusName: p.STATUS_NAM || 'לא ידוע',
            planNum:    p.PLAN_NUM   || '—',
            lengthM:    p.TTLLENKM  ?? 0,
            updDate:    p.MGN_UPD    || '',
            branchNo:   p.BRANCHNO   ?? 0,
            midpoint:   { lat: mid[1], lng: mid[0] },
            feature:    f,
          };
        });
      setSegments(segs);
    } catch {
      setError('שגיאה בטעינת נתוני המסילות');
    }
  };

  // ── Static blockages (always loaded from public/blockages.json) ────────────

  const fetchStaticBlockages = async () => {
    try {
      const res = await fetch('/blockages.json');
      if (!res.ok) return;
      const data: Project[] = await res.json();
      setProjects(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        return [...prev, ...data.filter(b => !existingIds.has(b.id))];
      });
    } catch { /* silent — static file missing is not critical */ }
  };

  // ── Supabase ───────────────────────────────────────────────────────────────

  const fetchFromDb = async () => {
    setSyncStatus('loading');
    try {
      const [dbProjects, dbStations] = await Promise.all([db.loadProjects(), db.loadCustomStations()]);
      setProjects(dbProjects);
      if (dbStations.length > 0) {
        setPoints(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          return [...prev, ...dbStations.filter(s => !existingIds.has(s.id))];
        });
      }
      setSyncStatus('ok');
    } catch (e) {
      setSyncStatus('error');
      setError(`שגיאה בטעינת הנתונים: ${e instanceof Error ? e.message : e}`);
    }
  };

  // ── Google Sheets sync ─────────────────────────────────────────────────────

  const fetchFromSheets = async () => {
    setSyncStatus('loading');
    try {
      const [sheetProjects, sheetStations] = await Promise.all([
        loadProjects(),
        loadCustomStations(),
      ]);
      if (sheetProjects.length > 0) {
        setProjects(prev => {
          // always keep static blockages (id starts with 'blockage-')
          const staticBlockages = prev.filter(p => p.id.startsWith('blockage-'));
          const sheetIds = new Set(sheetProjects.map(p => p.id));
          const uniqueStatic = staticBlockages.filter(p => !sheetIds.has(p.id));
          return [...sheetProjects, ...uniqueStatic];
        });
      }
      if (sheetStations.length > 0) {
        setPoints(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = sheetStations.filter(s => !existingIds.has(s.id));
          return [...prev, ...newOnes];
        });
      }
      setSyncStatus('ok');
    } catch {
      setSyncStatus('error');
    }
  };

  // ── Add handlers ───────────────────────────────────────────────────────────

  const handleAddStation = async (s: Omit<StoryPoint, 'id'>) => {
    if (useDb) {
      setShowAddStation(false);
      try {
        const saved = await db.saveStation(s);
        setPoints(prev => [...prev, saved]); setActivePoint(saved); setSyncStatus('ok');
      } catch (e) { setSyncStatus('error'); setError(`שגיאה בשמירת תחנה: ${e instanceof Error ? e.message : e}`); }
      return;
    }
    const p: StoryPoint = { ...s, id: `local-${Date.now()}` };
    setPoints(prev => [...prev, p]);
    setActivePoint(p);
    setShowAddStation(false);
    if (canWrite) {
      try { await saveStation(p); setSyncStatus('ok'); }
      catch (e) { setSyncStatus('error'); setError(`שגיאה בשמירת תחנה: ${e instanceof Error ? e.message : e}`); }
    }
  };

  const handleUpdateProject = async (data: Omit<Project, 'id'>) => {
    const target = editingProject;
    setEditingProject(null);
    if (!target) return;
    try {
      const saved = await db.updateProject({ ...data, id: target.id });
      setProjects(prev => prev.map(p => (p.id === saved.id ? saved : p)));
      setActiveProject(saved); setSyncStatus('ok');
    } catch (e) { setSyncStatus('error'); setError(`שגיאה בעדכון: ${e instanceof Error ? e.message : e}`); }
  };

  const handleDeleteProject = async (p: Project) => {
    try {
      await db.deleteProject(p.id);
      setProjects(prev => prev.filter(x => x.id !== p.id));
      setActiveProject(a => (a?.id === p.id ? undefined : a)); setSyncStatus('ok');
    } catch (e) { setSyncStatus('error'); setError(`שגיאה במחיקה: ${e instanceof Error ? e.message : e}`); }
  };

  const handleAddProject = async (s: Omit<Project, 'id'>) => {
    if (useDb) {
      setShowAddProject(false);
      try {
        const saved = await db.saveProject(s);
        setProjects(prev => [...prev, saved]); setActiveProject(saved); setSyncStatus('ok');
      } catch (e) { setSyncStatus('error'); setError(`שגיאה בשמירה: ${e instanceof Error ? e.message : e}`); }
      return;
    }
    const p: Project = { ...s, id: `proj-${Date.now()}` };
    setProjects(prev => [...prev, p]);
    setActiveProject(p);
    setShowAddProject(false);
    if (canWrite) {
      try { await saveProject(p); setSyncStatus('ok'); }
      catch (e) { setSyncStatus('error'); setError(`שגיאה בשמירת פרויקט: ${e instanceof Error ? e.message : e}`); }
    }
  };

  // ── Selection handlers ─────────────────────────────────────────────────────

  const selectStation = (p: StoryPoint) => {
    setActivePoint(p); setActiveProject(undefined); setActiveSegment(undefined);
  };
  const selectProject = (p: Project) => {
    setActiveProject(p); setActivePoint(undefined); setActiveSegment(undefined);
  };
  const selectSegment = (s: RailSegment) => {
    setActiveSegment(s); setActivePoint(undefined); setActiveProject(undefined);
  };

  // ── Sync indicator ─────────────────────────────────────────────────────────

  const runDiag = async () => {
    setSyncStatus('loading');
    const d = await diagnoseSheets();
    setDiag(d);
    setSyncStatus(d.ok ? 'ok' : 'error');
  };

  const SyncBadge = () => {
    const map: Record<SyncStatus, { icon: React.ReactNode; cls: string }> = {
      idle:    { icon: <Cloud size={14} />,                             cls: 'text-gray-400'  },
      loading: { icon: <Loader2 size={14} className="animate-spin" />, cls: 'text-blue-400'  },
      ok:      { icon: <Cloud size={14} />,                            cls: 'text-green-500' },
      error:   { icon: <CloudOff size={14} />,                         cls: 'text-red-400'   },
    };
    const { icon, cls } = map[syncStatus];
    return (
      <div className="flex items-center gap-1">
        <button onClick={useDb ? fetchFromDb : fetchFromSheets} title={useDb ? 'רענן ממסד הנתונים' : 'רענן מ-Sheets'}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${cls} hover:bg-gray-100`}>
          {useDb && syncStatus === 'ok' ? <Database size={14} /> : icon}<span className="hidden sm:inline">{useDb ? 'מסד נתונים' : 'Sheets'}</span>
        </button>
        {!useDb && (
          <button onClick={runDiag} title="אבחן חיבור ל-Sheets"
            className="px-1.5 py-1 rounded text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700">🔍</button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      {/* כותרת */}
      <header className="bg-white shadow-md p-4 shrink-0">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="https://yt3.googleusercontent.com/ytc/AIdro_mIX1mmwX8tImIHhdwdg6Pe8-NyvQbuOsYSt4M5Vqpggvw=s900-c-k-c0x00ffffff-no-rj"
              alt="לוגו רכבת ישראל"
              className="w-12 h-12 object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">תחנות הרכבת בישראל</h1>
              <p className="text-gray-500 text-sm">VONOMAP</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncBadge />
            {useDb && role === 'superadmin' && (
              <button onClick={() => setShowEditors(true)} title="ניהול עורכים"
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
                <Users className="w-4 h-4" /><span className="hidden lg:inline">עורכים</span>
              </button>
            )}
            {useDb && (userEmail ? (
              <button onClick={() => db.signOut()} title={`מחובר: ${userEmail}${role === 'superadmin' ? ' (מנהל על)' : role ? ' (עורך)' : ''} · לחץ להתנתקות`}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
                <LogOut className="w-4 h-4" /><span className="hidden md:inline max-w-[10rem] truncate" dir="ltr">{userEmail.replace(`@${db.USERNAME_DOMAIN}`, "")}</span>
              </button>
            ) : (
              <button onClick={() => setLogin({})}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
                <LogIn className="w-4 h-4" /> כניסה
              </button>
            ))}
            <button onClick={() => requireEditor(() => setShowAddStation(true))}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> הוסף תחנה
            </button>
            <button onClick={() => requireEditor(() => setShowAddProject(true))}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> הוסף פרויקט
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 text-sm shrink-0">{error}</div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* פאנל צד */}
        <div className={`transition-all duration-300 border-l border-gray-200 flex flex-col shrink-0 ${isExpanded ? 'w-2/3' : 'w-1/3'}`}>
          <div className="relative flex-1 overflow-hidden">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="absolute top-3 left-3 p-1.5 bg-white rounded-full shadow-md hover:bg-gray-50 z-10"
            >
              {isExpanded ? <Minimize2 className="w-4 h-4 text-gray-600" /> : <Maximize2 className="w-4 h-4 text-gray-600" />}
            </button>
            <StoryPanel
              points={points}         activePoint={activePoint}    onPointSelect={selectStation}
              projects={resolvedProjects} activeProject={activeProject} onProjectSelect={selectProject}
              segments={segments}     activeSegment={activeSegment} onSegmentSelect={selectSegment}
              isExpanded={isExpanded}
              canEdit={useDb && editor} onEditProject={p => setEditingProject(p)} onDeleteProject={handleDeleteProject}
            />
          </div>
        </div>

        {/* מפה */}
        <div className={`relative flex-1 transition-all duration-300 ${isExpanded ? 'w-1/3' : 'w-2/3'}`}>
          <Map
            points={points}         activePoint={activePoint}    onMarkerClick={selectStation}
            projects={resolvedProjects} activeProject={activeProject} onProjectClick={selectProject}
            statusGeoJSON={statusGeoJSON}
            activeSegment={activeSegment}               onSegmentClick={selectSegment}
            canEdit={useDb && editor} onEditProject={p => setEditingProject(p)} onDeleteProject={handleDeleteProject}
          />
        </div>
      </div>

      {login && (
        <LoginModal reason={login.reason} onClose={() => setLogin(null)}
          onSignedIn={async () => {
            const r = await db.myRole();
            setRole(r);
            const ok = r !== null;
            if (ok) { const then = login.then; setLogin(null); then?.(); }
            else setLogin({ reason: 'ההתחברות הצליחה, אבל המשתמש אינו מוגדר כעורך. פנה למנהל המערכת.' });
          }} />
      )}
      {showAddStation && <AddStationForm onSubmit={handleAddStation} onClose={() => setShowAddStation(false)} />}
      {showAddProject && <AddProjectForm onSubmit={handleAddProject} onClose={() => setShowAddProject(false)} />}
      {editingProject && (
        <AddProjectForm key={editingProject.id} initial={editingProject}
          onSubmit={handleUpdateProject} onClose={() => setEditingProject(null)} />
      )}
      {showEditors && userEmail && <EditorsModal myEmail={userEmail} onClose={() => setShowEditors(false)} />}

      {/* Sheets diagnostic modal */}
      {diag && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDiag(null)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-md text-sm" dir="ltr" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800">Sheets Diagnostic — RAIL1</h3>
              <button onClick={() => setDiag(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>

            <div className={`mb-3 px-3 py-2 rounded-lg font-semibold ${diag.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {diag.ok ? `✅ Connected — ${diag.rowCount} rows` : `❌ Failed (HTTP ${diag.rawStatus})`}
            </div>

            {diag.error && (
              <div className="mb-3 bg-red-50 rounded p-2 text-red-600 break-all text-xs">{diag.error}</div>
            )}

            {diag.columns.length > 0 ? (
              <div className="mb-3">
                <p className="font-semibold text-gray-700 mb-1">Columns found ({diag.columns.length}):</p>
                <div className="flex flex-wrap gap-1">
                  {diag.columns.map(c => (
                    <span key={c} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-mono">{c}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-3 text-amber-700 bg-amber-50 rounded p-2 text-xs">
                <strong>No rows found.</strong> The sheet may be empty or column names don't match.<br/>
                Expected columns: <span className="font-mono">id, title, projectType, lat, lng, geometry, targetYear, cost, trafficPurpose, trafficStartDate, trafficClosureDate, trafficClosureDuration, locationName, contacts, initiator, contractor, managementCompany, image, notes, createdAt</span>
              </div>
            )}

            <p className="text-gray-400 text-xs">Click outside to close</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
