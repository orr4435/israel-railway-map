import React, { useState, useEffect } from 'react';
import { Map } from './components/Map';
import { StoryPanel } from './components/StoryPanel';
import { StoryPoint, Project, RailSegment } from './types';
import { Plus, Maximize2, Minimize2, CloudOff, Cloud, Loader2 } from 'lucide-react';
import { AddStationForm } from './components/AddStationForm';
import { AddProjectForm } from './components/AddProjectForm';
import {
  sheetsEnabled,
  loadProjects, saveProject,
  loadCustomStations, saveStation,
} from './lib/sheets';

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

  useEffect(() => {
    fetchStations();
    fetchSegments();
    if (sheetsEnabled) fetchFromSheets();
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

  // ── Google Sheets sync ─────────────────────────────────────────────────────

  const fetchFromSheets = async () => {
    setSyncStatus('loading');
    try {
      const [sheetProjects, sheetStations] = await Promise.all([
        loadProjects(),
        loadCustomStations(),
      ]);
      if (sheetProjects.length > 0) setProjects(sheetProjects);
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
    const p: StoryPoint = { ...s, id: `local-${Date.now()}` };
    setPoints(prev => [...prev, p]);
    setActivePoint(p);
    setShowAddStation(false);
    if (sheetsEnabled) {
      try { await saveStation(p); setSyncStatus('ok'); }
      catch { setSyncStatus('error'); }
    }
  };

  const handleAddProject = async (s: Omit<Project, 'id'>) => {
    const p: Project = { ...s, id: `proj-${Date.now()}` };
    setProjects(prev => [...prev, p]);
    setActiveProject(p);
    setShowAddProject(false);
    if (sheetsEnabled) {
      try { await saveProject(p); setSyncStatus('ok'); }
      catch { setSyncStatus('error'); }
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

  const SyncBadge = () => {
    if (!sheetsEnabled) return null;
    const map: Record<SyncStatus, { icon: React.ReactNode; cls: string; title: string }> = {
      idle:    { icon: <Cloud size={14} />,                               cls: 'text-gray-400',  title: 'Sheets: מחובר' },
      loading: { icon: <Loader2 size={14} className="animate-spin" />,    cls: 'text-blue-400',  title: 'מסנכרן…' },
      ok:      { icon: <Cloud size={14} />,                               cls: 'text-green-500', title: 'Sheets: מסונכרן' },
      error:   { icon: <CloudOff size={14} />,                            cls: 'text-red-400',   title: 'שגיאת סנכרון Sheets' },
    };
    const { icon, cls, title } = map[syncStatus];
    return (
      <button onClick={fetchFromSheets} title={title}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${cls} hover:bg-gray-100`}>
        {icon}
        <span className="hidden sm:inline">Sheets</span>
      </button>
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
              <p className="text-gray-500 text-sm">מפת סיפור המציגה את תחנות הרכבת ברחבי הארץ</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncBadge />
            <button onClick={() => setShowAddStation(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> הוסף תחנה
            </button>
            <button onClick={() => setShowAddProject(true)}
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
              projects={projects}     activeProject={activeProject} onProjectSelect={selectProject}
              segments={segments}     activeSegment={activeSegment} onSegmentSelect={selectSegment}
              isExpanded={isExpanded}
            />
          </div>
        </div>

        {/* מפה */}
        <div className={`relative flex-1 transition-all duration-300 ${isExpanded ? 'w-1/3' : 'w-2/3'}`}>
          <Map
            points={points}         activePoint={activePoint}    onMarkerClick={selectStation}
            projects={projects}     activeProject={activeProject} onProjectClick={selectProject}
            statusGeoJSON={statusGeoJSON}
            activeSegment={activeSegment}               onSegmentClick={selectSegment}
          />
        </div>
      </div>

      {showAddStation && <AddStationForm onSubmit={handleAddStation} onClose={() => setShowAddStation(false)} />}
      {showAddProject && <AddProjectForm onSubmit={handleAddProject} onClose={() => setShowAddProject(false)} />}
    </div>
  );
}

export default App;
