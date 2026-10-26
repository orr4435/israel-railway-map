import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, GeoJSON as LeafletGeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { StoryPoint, Project, RailSegment, getStatusStyle, getSegmentStyle, STATUS_COLORS, SEGMENT_STATUS_COLORS, PROJECT_TYPES } from '../types';
import { toDirectImageUrl } from '../lib/image';
import { TRAFFIC_STATUS, TRAFFIC_STATUS_ORDER, TrafficStatus, getTrafficStatus, formatDate, isTraffic, hasCoords } from '../lib/traffic';
import L from 'leaflet';
// ── Icons ─────────────────────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Pulsing halo behind an active marker
function pulseRing(color: string, size: number): string {
  return `<span class="marker-pulse-ring" style="width:${size * 1.6}px;height:${size * 1.6}px;background:${color}"></span>`;
}

function makeCircleIcon(color: string, size: number, pulse = false) {
  const ring = pulse ? pulseRing(color, size) : '';
  return L.divIcon({
    html: `<div style="position:relative;width:${size}px;height:${size}px">${ring}<div style="position:relative;width:${size}px;height:${size}px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div></div>`,
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 4],
  });
}

function projectTypeColor(type?: string): string {
  return PROJECT_TYPES.find(t => t.type === type)?.color ?? '#16a34a';
}

function makeProjectIcon(projectType: string | undefined, isActive: boolean): L.DivIcon {
  const color = projectTypeColor(projectType);
  const size  = isActive ? 20 : 14;

  const ring = isActive ? pulseRing(color, size) : '';

  if (projectType === 'הסדרי_תנועה') {
    // diamond shape for traffic arrangements
    return L.divIcon({
      html: `<div style="position:relative;width:${size}px;height:${size}px">${ring}<div style="position:relative;width:${size}px;height:${size}px;background:${color};border:2.5px solid white;transform:rotate(45deg);box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div></div>`,
      className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 4],
    });
  }

  if (projectType === 'הקמת_מסילה') {
    // triangle for rail construction
    const h = Math.round(size * 0.87);
    return L.divIcon({
      html: `<div style="position:relative;width:${size}px;height:${h}px;display:flex;align-items:center;justify-content:center">${ring}<div style="position:relative;width:0;height:0;border-left:${size / 2}px solid transparent;border-right:${size / 2}px solid transparent;border-bottom:${h}px solid ${color};filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))"></div></div>`,
      className: '', iconSize: [size, h], iconAnchor: [size / 2, h / 2], popupAnchor: [0, -h / 2 - 4],
    });
  }

  if (projectType === 'שדרוג_תשתית') {
    // road-barrier stripe pattern for blockages
    return L.divIcon({
      html: `<div style="position:relative;width:${size}px;height:${size}px">${ring}<div style="position:relative;width:${size}px;height:${size}px;background:repeating-linear-gradient(-45deg,${color},${color} 3px,#fff 3px,#fff 6px);border:2px solid white;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div></div>`,
      className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 4],
    });
  }

  return makeCircleIcon(color, size, isActive);
}

// Traffic arrangements: a dot coloured by date status; a yellow "!" badge when the end date is missing
function makeTrafficIcon(status: TrafficStatus, isActive: boolean): L.DivIcon {
  const color = TRAFFIC_STATUS[status].color;
  const size  = isActive ? 24 : 18;
  const ring  = isActive ? pulseRing(color, size) : '';
  // white border plus a dark outer ring keeps these apart from the (smaller, borderless-ring) station dots
  const shadow = '0 0 0 1.5px #1f2937, 0 2px 5px rgba(0,0,0,0.45)';
  const inner = status === 'no_end'
    ? `<div style="position:relative;width:${size}px;height:${size}px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;color:#422006;font:900 ${Math.round(size * 0.62)}px/1 system-ui,sans-serif">!</div>`
    : `<div style="position:relative;width:${size}px;height:${size}px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:${shadow}"></div>`;
  return L.divIcon({
    html: `<div style="position:relative;width:${size}px;height:${size}px">${ring}${inner}</div>`,
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 4],
  });
}

// Legend in the map corner; each row also toggles that status on the map
function TrafficLegend({ counts, visible, onToggle }: {
  counts: Record<TrafficStatus, number>; visible: Record<TrafficStatus, boolean>; onToggle: (s: TrafficStatus) => void;
}) {
  return (
    <div className="absolute top-[88px] left-3 bg-white/95 rounded-xl shadow-lg z-[1000] px-3 py-2 text-right" dir="rtl" style={{ minWidth: 190 }}
      onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      <p className="text-[11px] font-bold text-gray-500 mb-1.5">🚦 הסדרי תנועה</p>
      {TRAFFIC_STATUS_ORDER.map(s => {
        const st = TRAFFIC_STATUS[s], on = visible[s];
        return (
          <button key={s} type="button" onClick={() => onToggle(s)} title={on ? 'הסתר במפה' : 'הצג במפה'}
            className={`w-full flex items-center gap-2 py-0.5 text-xs transition-opacity ${on ? '' : 'opacity-35'}`}>
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: st.color, border: '2px solid #fff',
              boxShadow: '0 0 0 1.5px #1f2937', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#422006', fontSize: 9, fontWeight: 900, flexShrink: 0 }}>{s === 'no_end' ? '!' : ''}</span>
            <span className="font-medium text-gray-700 whitespace-nowrap">{st.label}</span>
            <span className="text-gray-400 text-[11px] truncate">{st.legend}</span>
            <span className="mr-auto text-gray-500 font-semibold pr-2">{counts[s]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Fly-to ────────────────────────────────────────────────────────────────────
function MapTransition({ target }: { target?: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 11, { duration: 1.4, easeLinearity: 0.25 });
  }, [target, map]);
  return null;
}

// ── Popup helper ──────────────────────────────────────────────────────────────
function segmentPopupHTML(p: any): string {
  const st    = getSegmentStyle(p.STATUS_NAM || '');
  const lenKm = p.TTLLENKM ? (p.TTLLENKM / 1000).toFixed(2) : '—';
  return `
    <div dir="rtl" style="min-width:200px;font-family:inherit">
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">${p.NOTE || '—'}</div>
      <span style="display:inline-block;background:${st.color}22;color:${st.color};border:1px solid ${st.color}55;
        border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;margin-bottom:6px">
        ${st.label}
      </span>
      <table style="font-size:12px;color:#555;width:100%;border-collapse:collapse">
        <tr><td style="padding:2px 0;color:#888">מספר תכנית</td><td style="padding:2px 0 2px 8px;font-weight:600">${p.PLAN_NUM || '—'}</td></tr>
        <tr><td style="padding:2px 0;color:#888">אורך</td><td style="padding:2px 0 2px 8px;font-weight:600">${lenKm} ק"מ</td></tr>
        <tr><td style="padding:2px 0;color:#888">עדכון אחרון</td><td style="padding:2px 0 2px 8px;font-weight:600">${p.MGN_UPD || '—'}</td></tr>
        <tr><td style="padding:2px 0;color:#888">מסועף</td><td style="padding:2px 0 2px 8px;font-weight:600">${p.BRANCHNO ?? '—'}</td></tr>
      </table>
    </div>`;
}

// ── Layer-control panel ───────────────────────────────────────────────────────
interface LayerState { railLines: boolean; projects: boolean }
interface StatusVisibility { [status: string]: boolean }

function LayerControlPanel({
  layers, onToggle,
  statusVis, onToggleStatus, statusCounts,
  projectCount,
  blockageTitles, blockageVis, onToggleBlockage,
  onToggleAll, allOff,
}: {
  layers: LayerState; onToggle: (k: keyof LayerState) => void;
  statusVis: StatusVisibility; onToggleStatus: (s: string) => void;
  statusCounts: Record<string, number>;
  projectCount: number;
  blockageTitles: string[]; blockageVis: Record<string, boolean>; onToggleBlockage: (t: string) => void;
  onToggleAll: () => void; allOff: boolean;
}) {
  const [open, setOpen] = useState(true);
  const BLOCKAGE_COLOR = '#d97706';

  const base: { key: keyof LayerState; label: string; color: string; isLine?: boolean }[] = [
    { key: 'railLines', label: 'מסילות',                             color: '#3730a3', isLine: true },
    { key: 'projects',  label: `הסדרי תנועה וחסמים (${projectCount})`, color: '#16a34a' },
  ];

  const dot = (color: string, isLine?: boolean) =>
    isLine
      ? <span style={{ display:'inline-block', width:14, height:3, background:color, borderRadius:2 }} />
      : <span style={{ display:'inline-block', width:11, height:11, background:color, borderRadius:'50%' }} />;

  const barrierDot = (size = 11) => (
    <span style={{
      display:'inline-block', width:size, height:size, borderRadius:2,
      background:`repeating-linear-gradient(-45deg,${BLOCKAGE_COLOR},${BLOCKAGE_COLOR} 2px,#fff 2px,#fff 4px)`,
      border:`1.5px solid ${BLOCKAGE_COLOR}`, flexShrink:0,
    }} />
  );

  return (
    <div className="absolute top-4 right-4 bg-white rounded-xl shadow-lg z-[1000] overflow-hidden text-right" dir="rtl" style={{ minWidth:230 }}>
      {/* header + toggle-all */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-gray-100">
        <button onClick={() => setOpen(o => !o)}
          className="text-[11px] font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600">
          {open ? '▲ שכבות' : '▼ שכבות'}
        </button>
        <button onClick={onToggleAll}
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
            allOff
              ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>
          {allOff ? 'הפעל הכל' : 'כבה הכל'}
        </button>
      </div>

      {open && (
        <>
          {/* base layers */}
          <div className="px-3 pt-2 pb-2">
            {base.map(({ key, label, color, isLine }) => (
              <label key={key} className="flex items-center gap-2 mb-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={layers[key]} onChange={() => onToggle(key)} className="w-3.5 h-3.5 accent-blue-600" />
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  {dot(color, isLine)} {label}
                </span>
              </label>
            ))}
          </div>

          {/* חסמים לפי פרויקט */}
          {blockageTitles.length > 0 && (
            <div className="border-t border-gray-100 px-3 pt-2 pb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">חסמים לפי פרויקט</p>
              {blockageTitles.map(title => (
                <label key={title} className="flex items-center gap-2 mb-1 cursor-pointer select-none">
                  <input type="checkbox" checked={blockageVis[title] ?? true}
                    onChange={() => onToggleBlockage(title)}
                    className="w-3.5 h-3.5" style={{ accentColor: BLOCKAGE_COLOR }} />
                  <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: BLOCKAGE_COLOR }}>
                    {barrierDot()} {title}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* מסילות לפי סטטוס */}
          <div className="border-t border-gray-100 px-3 pt-2 pb-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">מסילות לפי סטטוס</p>
            {Object.entries(SEGMENT_STATUS_COLORS).map(([status, st]) => (
              <label key={status} className="flex items-center gap-2 mb-1 cursor-pointer select-none">
                <input type="checkbox" checked={statusVis[status] ?? true} onChange={() => onToggleStatus(status)} className="w-3.5 h-3.5" style={{ accentColor: st.color }} />
                <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: st.color }}>
                  {dot(st.color, true)} {st.label}
                </span>
                <span className="text-xs text-gray-400 mr-auto">{statusCounts[status] ?? 0}</span>
              </label>
            ))}
          </div>

          {/* תחנות לפי סטטוס */}
          <div className="border-t border-gray-100 px-3 pt-2 pb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">תחנות לפי סטטוס</p>
            {Object.entries(STATUS_COLORS).map(([status, st]) => (
              <label key={status} className="flex items-center gap-2 mb-1 cursor-pointer select-none">
                <input type="checkbox" checked={statusVis[`stn_${status}`] ?? true} onChange={() => onToggleStatus(`stn_${status}`)} className="w-3.5 h-3.5" style={{ accentColor: st.color }} />
                <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: st.color }}>
                  {dot(st.color)} {st.label}
                </span>
                <span className="text-xs text-gray-400 mr-auto">{statusCounts[`stn_${status}`] ?? 0}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Map ──────────────────────────────────────────────────────────────────
interface MapProps {
  points: StoryPoint[];         activePoint?: StoryPoint;     onMarkerClick: (p: StoryPoint) => void;
  projects: Project[];          activeProject?: Project;      onProjectClick: (p: Project) => void;
  statusGeoJSON: any;           activeSegment?: RailSegment;  onSegmentClick: (s: RailSegment) => void;
  canEdit?: boolean;
  onEditProject?: (p: Project) => void;
  onDeleteProject?: (p: Project) => Promise<void> | void;
}

// Edit / delete buttons inside a project popup (editors only). Delete needs a second click.
function PopupActions({ project, onEdit, onDelete }: {
  project: Project; onEdit?: (p: Project) => void; onDelete?: (p: Project) => Promise<void> | void;
}) {
  const [confirm, setConfirm] = useState(false);
  const btn = { fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer' } as const;
  return (
    <div dir="rtl" style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
      <button style={{ ...btn, background: '#eff6ff', color: '#1d4ed8' }} onClick={() => onEdit?.(project)}>✏️ עריכה</button>
      {confirm
        ? <button style={{ ...btn, background: '#dc2626', color: '#fff' }} onClick={() => onDelete?.(project)}>לאשר מחיקה</button>
        : <button style={{ ...btn, background: '#fef2f2', color: '#b91c1c' }} onClick={() => setConfirm(true)}>🗑 מחיקה</button>}
    </div>
  );
}

export function Map({ points, activePoint, onMarkerClick, projects, activeProject, onProjectClick, statusGeoJSON, activeSegment, onSegmentClick, canEdit, onEditProject, onDeleteProject }: MapProps) {
  const center = { lat: 31.8, lng: 34.9 };

  const [layers, setLayers] = useState<LayerState>({ railLines: true, projects: true });

  const [statusVis, setStatusVis] = useState<StatusVisibility>(() => ({
    ...Object.fromEntries(Object.keys(SEGMENT_STATUS_COLORS).map(s => [s, true])),
    ...Object.fromEntries(Object.keys(STATUS_COLORS).map(s => [`stn_${s}`, true])),
  }));

  // blockage sub-layers — keyed by unique project title
  const [blockageVis, setBlockageVis] = useState<Record<string, boolean>>({});

  const blockageTitles = useMemo(() => {
    const seen = new Set<string>();
    projects.filter(p => p.projectType === 'שדרוג_תשתית').forEach(p => seen.add(p.title));
    return [...seen].sort((a, b) => a.localeCompare(b, 'he'));
  }, [projects]);

  useEffect(() => {
    setBlockageVis(prev => {
      const next = { ...prev };
      blockageTitles.forEach(t => { if (!(t in next)) next[t] = true; });
      return next;
    });
  }, [blockageTitles]);

  const [trafficVis, setTrafficVis] = useState<Record<TrafficStatus, boolean>>({ upcoming: true, active: true, ended: true, no_end: true });
  const trafficStatusOf = useMemo(() => {
    const m: Record<string, TrafficStatus> = {};
    projects.filter(isTraffic).forEach(p => { m[p.id] = getTrafficStatus(p); });
    return m;
  }, [projects]);
  const trafficCounts = useMemo(() => {
    const c: Record<TrafficStatus, number> = { upcoming: 0, active: 0, ended: 0, no_end: 0 };
    projects.filter(p => isTraffic(p) && hasCoords(p.location)).forEach(p => c[trafficStatusOf[p.id]]++);
    return c;
  }, [projects, trafficStatusOf]);

  const visibleProjects = useMemo(() =>
    layers.projects
      ? projects.filter(p =>
          isTraffic(p)
            ? hasCoords(p.location) && trafficVis[trafficStatusOf[p.id]]
            : p.projectType !== 'שדרוג_תשתית' || (blockageVis[p.title] ?? true)
        )
      : [],
    [projects, layers.projects, blockageVis, trafficVis, trafficStatusOf]
  );

  const segmentCounts = useMemo<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    (statusGeoJSON?.features ?? []).forEach((f: any) => {
      const s = f.properties?.STATUS_NAM || '';
      if (s) acc[s] = (acc[s] ?? 0) + 1;
    });
    points.forEach(p => { acc[`stn_${p.status}`] = (acc[`stn_${p.status}`] ?? 0) + 1; });
    return acc;
  }, [statusGeoJSON, points]);

  const toggleLayer        = (k: keyof LayerState) => setLayers(p => ({ ...p, [k]: !p[k] }));
  const toggleStatus       = (s: string)           => setStatusVis(p => ({ ...p, [s]: !p[s] }));
  const toggleBlockage     = (t: string)           => setBlockageVis(p => ({ ...p, [t]: !p[t] }));

  const allOff = !Object.values(layers).some(v => v) &&
                 !Object.values(statusVis).some(v => v) &&
                 !Object.values(blockageVis).some(v => v);

  const toggleAll = () => {
    if (allOff) {
      setLayers({ railLines: true, projects: true });
      setStatusVis(prev => Object.fromEntries(Object.keys(prev).map(k => [k, true])));
      setBlockageVis(prev => Object.fromEntries(Object.keys(prev).map(k => [k, true])));
    } else {
      setLayers({ railLines: false, projects: false });
      setStatusVis(prev => Object.fromEntries(Object.keys(prev).map(k => [k, false])));
      setBlockageVis(prev => Object.fromEntries(Object.keys(prev).map(k => [k, false])));
    }
  };

  // ── GeoJSON style functions ──────────────────────────────────────────────────
  const railStyle = (feature: any) => {
    const statusName = feature?.properties?.STATUS_NAM || '';
    if (!statusVis[statusName]) return { opacity: 0, color: 'transparent', weight: 0 };
    const st = getSegmentStyle(statusName);
    return { color: st.color, weight: activeSegment?.id === String(feature?.properties?.OBJECTID) ? 5 : 2.5, opacity: 0.75 };
  };

  const activeFeatureCollection = useMemo(() => {
    if (!activeSegment) return null;
    return { type: 'FeatureCollection', features: [activeSegment.feature] };
  }, [activeSegment]);

  const highlightStyle = () => ({ color: '#f59e0b', weight: 6, opacity: 0.9 });

  const railOnEachFeature = (feature: any, layer: L.Layer) => {
    const p = feature.properties ?? {};
    layer.bindPopup(segmentPopupHTML(p));
    layer.on('click', () => {
      const coords: number[][] = feature.geometry?.coordinates ?? [];
      const mid = coords[Math.floor(coords.length / 2)] ?? [34.9, 31.8];
      onSegmentClick({
        id:         String(p.OBJECTID),
        note:       p.NOTE       || '—',
        statusName: p.STATUS_NAM || '—',
        planNum:    p.PLAN_NUM   || '—',
        lengthM:    p.TTLLENKM  ?? 0,
        updDate:    p.MGN_UPD    || '',
        branchNo:   p.BRANCHNO   ?? 0,
        midpoint:   { lat: mid[1], lng: mid[0] },
        feature,
      });
    });
  };

  const flyTarget = activeSegment?.midpoint
    ?? (activeProject && hasCoords(activeProject.location) ? activeProject.location : undefined)
    ?? activePoint?.location;

  const visiblePoints = useMemo(
    () => points.filter(p => statusVis[`stn_${p.status}`] ?? false),
    [points, statusVis]
  );

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={8} className="w-full h-full">
      <TileLayer
        attribution='&copy; <a href="https://www.waze.com">Waze</a>'
        url="https://il-livemap-tiles3.waze.com/tiles/{z}/{x}/{y}.png"
      />
      <MapTransition target={flyTarget} />

      {/* מסילות — colored by STATUS_NAM */}
      {statusGeoJSON && layers.railLines && (
        <LeafletGeoJSON key={`rail-${activeSegment?.id}`} data={statusGeoJSON} style={railStyle} onEachFeature={railOnEachFeature} />
      )}

      {/* הדגשת מסילה פעילה */}
      {activeFeatureCollection && layers.railLines && (
        <LeafletGeoJSON key={`highlight-${activeSegment?.id}`} data={activeFeatureCollection} style={highlightStyle} />
      )}

      {/* תחנות — polyline geometry (if drawn) */}
      {visiblePoints.filter(p => p.geometry?.type === 'LineString').map(point => {
        const st    = getStatusStyle(point.status);
        const active = activePoint?.id === point.id;
        const positions = (point.geometry!.coordinates).map(c => [c.lat, c.lng] as [number, number]);
        return (
          <Polyline key={`stn-line-${point.id}`} positions={positions}
            color={st.color} weight={active ? 4 : 2.5} opacity={0.8} dashArray={active ? undefined : '6 3'}
            eventHandlers={{ click: () => onMarkerClick(point) }}
          />
        );
      })}

      {/* תחנות — circle icon colored by status */}
      {visiblePoints.map(point => {
        const st     = getStatusStyle(point.status);
        const active = activePoint?.id === point.id;
        return (
          <Marker key={point.id} position={[point.location.lat, point.location.lng]}
            icon={makeCircleIcon(st.color, active ? 18 : 12, active)}
            eventHandlers={{ click: () => onMarkerClick(point) }}>
            <Popup>
              <div dir="rtl">
                <strong className="text-base">{point.title}</strong>
                <p className="text-sm mt-0.5" style={{ color: st.color }}>{st.label}</p>
                {point.geometry?.type === 'LineString' && (
                  <p className="text-xs text-gray-400 mt-1">קו · {point.geometry.coordinates.length} נקודות</p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* פרויקטים — polyline geometry */}
      {visibleProjects.filter(p => p.geometry?.type === 'LineString').map(project => {
        const typeClr = isTraffic(project) ? TRAFFIC_STATUS[trafficStatusOf[project.id]].color : projectTypeColor(project.projectType);
        const active  = activeProject?.id === project.id;
        const positions = (project.geometry!.coordinates).map(c => [c.lat, c.lng] as [number, number]);
        return (
          <Polyline key={`proj-line-${project.id}`} positions={positions}
            color={typeClr} weight={active ? 5 : 3} opacity={0.85}
            dashArray={project.projectType === 'הסדרי_תנועה' ? '8 4' : project.projectType === 'הקמת_מסילה' ? undefined : '5 3'}
            eventHandlers={{ click: () => onProjectClick(project) }}
          />
        );
      })}

      {/* פרויקטים — icon shape and color per projectType */}
      {visibleProjects.map(project => {
        const active   = activeProject?.id === project.id;
        const typeInfo = PROJECT_TYPES.find(t => t.type === project.projectType);
        const typeLbl  = typeInfo?.label ?? 'פרויקט';
        const typeClr  = projectTypeColor(project.projectType);
        return (
          <Marker key={project.id} position={[project.location.lat, project.location.lng]}
            icon={isTraffic(project) ? makeTrafficIcon(trafficStatusOf[project.id], active) : makeProjectIcon(project.projectType, active)}
            zIndexOffset={isTraffic(project) ? 500 : 0}
            eventHandlers={{ click: () => onProjectClick(project) }}>
            <Popup>
              {isTraffic(project) ? (
                <div dir="rtl" style={{ minWidth: 200, fontFamily: 'inherit' }}>
                  <strong style={{ display:'block', fontSize:14, marginBottom:4 }}>{project.title}</strong>
                  <span style={{ display:'inline-block', background: TRAFFIC_STATUS[trafficStatusOf[project.id]].color + '22',
                    color: trafficStatusOf[project.id] === 'no_end' ? '#854d0e' : TRAFFIC_STATUS[trafficStatusOf[project.id]].color,
                    border:`1px solid ${TRAFFIC_STATUS[trafficStatusOf[project.id]].color}66`, borderRadius:999, padding:'1px 8px',
                    fontSize:11, fontWeight:700, marginBottom:6 }}>
                    {trafficStatusOf[project.id] === 'no_end' ? '⚠ ' : '● '}{TRAFFIC_STATUS[trafficStatusOf[project.id]].label}
                  </span>
                  <table style={{ fontSize:12, color:'#444', width:'100%', borderCollapse:'collapse' }}>
                    <tbody>
                      <tr><td style={{ color:'#888', padding:'2px 0' }}>תאריך התחלה</td><td style={{ paddingRight:10, fontWeight:600 }}>{formatDate(project.trafficStartDate)}</td></tr>
                      <tr><td style={{ color:'#888', padding:'2px 0' }}>תאריך סיום</td><td style={{ paddingRight:10, fontWeight:600 }}>{formatDate(project.trafficClosureDate)}</td></tr>
                      {(project.locationName || project.matchedStation) && (
                        <tr><td style={{ color:'#888', padding:'2px 0' }}>מיקום</td><td style={{ paddingRight:10, fontWeight:600 }}>{project.locationName || project.matchedStation}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
              <div dir="rtl" style={{ minWidth: 190, fontFamily: 'inherit' }}>
                <span style={{ display:'inline-block', background: typeClr + '22', color: typeClr,
                  border:`1px solid ${typeClr}55`, borderRadius:999, padding:'1px 8px',
                  fontSize:11, fontWeight:600, marginBottom:4 }}>
                  {typeInfo?.icon ?? ''} {typeLbl}
                </span>
                <strong style={{ display:'block', color:'#166534', marginTop:2, fontSize:14 }}>{project.title}</strong>

                {project.image && (
                  <img src={toDirectImageUrl(project.image)} alt={project.title}
                    style={{ width:'100%', height:110, objectFit:'cover', borderRadius:8, marginTop:6 }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                )}

                {project.projectType === 'הסדרי_תנועה' ? (
                  <table style={{ fontSize:12, color:'#555', marginTop:6, width:'100%', borderCollapse:'collapse' }}>
                    {project.trafficPurpose         && <tr><td style={{ color:'#888', paddingBottom:2 }}>מטרת ההסדר</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.trafficPurpose}</td></tr>}
                    {project.trafficClosureDate     && <tr><td style={{ color:'#888', paddingBottom:2 }}>מועד סגירה</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.trafficClosureDate}</td></tr>}
                    {project.trafficClosureDuration && <tr><td style={{ color:'#888', paddingBottom:2 }}>משך סגירה</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.trafficClosureDuration}</td></tr>}
                    {project.contractor             && <tr><td style={{ color:'#888', paddingBottom:2 }}>קבלן</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.contractor}</td></tr>}
                    {project.managementCompany      && <tr><td style={{ color:'#888', paddingBottom:2 }}>חברת ניהול</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.managementCompany}</td></tr>}
                    {project.notes                  && <tr><td style={{ color:'#888', paddingBottom:2 }}>הערות</td><td style={{ paddingRight:8 }}>{project.notes}</td></tr>}
                  </table>
                ) : project.projectType === 'שדרוג_תשתית' ? (
                  <table style={{ fontSize:12, color:'#555', marginTop:6, width:'100%', borderCollapse:'collapse' }}>
                    {project.subProject        && <tr><td style={{ color:'#888', paddingBottom:2 }}>תת פרויקט</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.subProject}</td></tr>}
                    {project.initiator         && <tr><td style={{ color:'#888', paddingBottom:2 }}>יזם</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.initiator}</td></tr>}
                    {project.representative    && <tr><td style={{ color:'#888', paddingBottom:2 }}>נציג</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.representative}</td></tr>}
                    {project.managementCompany && <tr><td style={{ color:'#888', paddingBottom:2 }}>חברת ניהול</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.managementCompany}</td></tr>}
                    {project.blockageStatus    && <tr><td style={{ color:'#888', paddingBottom:2 }}>סטטוס</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.blockageStatus}</td></tr>}
                    {project.notes             && <tr><td style={{ color:'#888', paddingBottom:2 }}>הערות</td><td style={{ paddingRight:8 }}>{project.notes}</td></tr>}
                  </table>
                ) : (
                  <table style={{ fontSize:12, color:'#555', marginTop:6, width:'100%', borderCollapse:'collapse' }}>
                    {project.targetYear && <tr><td style={{ color:'#888', paddingBottom:2 }}>שנת יעד</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.targetYear}</td></tr>}
                    {project.cost       && <tr><td style={{ color:'#888', paddingBottom:2 }}>עלות</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.cost}</td></tr>}
                    {project.notes      && <tr><td style={{ color:'#888', paddingBottom:2 }}>הערות</td><td style={{ paddingRight:8 }}>{project.notes}</td></tr>}
                  </table>
                )}
              </div>
              )}
              {canEdit && <PopupActions project={project} onEdit={onEditProject} onDelete={onDeleteProject} />}
            </Popup>
          </Marker>
        );
      })}

      {layers.projects && (
        <TrafficLegend counts={trafficCounts} visible={trafficVis}
          onToggle={st => setTrafficVis(v => ({ ...v, [st]: !v[st] }))} />
      )}

      <LayerControlPanel
        layers={layers}             onToggle={toggleLayer}
        statusVis={statusVis}       onToggleStatus={toggleStatus}
        statusCounts={segmentCounts}
        projectCount={projects.length}
        blockageTitles={blockageTitles} blockageVis={blockageVis} onToggleBlockage={toggleBlockage}
        onToggleAll={toggleAll}     allOff={allOff}
      />
    </MapContainer>
  );
}
