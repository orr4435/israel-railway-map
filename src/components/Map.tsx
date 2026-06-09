import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, GeoJSON as LeafletGeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { StoryPoint, Project, RailSegment, getStatusStyle, getSegmentStyle, STATUS_COLORS, SEGMENT_STATUS_COLORS, PROJECT_TYPES } from '../types';
import { toDirectImageUrl } from '../lib/image';
import L from 'leaflet';
import proj4 from 'proj4';

// ── Coordinate conversion (for 333.geojson) ───────────────────────────────────
const ITM_PROJ =
  '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=-48,55,52,0,0,0,0 +units=m +no_defs';
const WGS84_PROJ = '+proj=longlat +datum=WGS84 +no_defs';

function convertITMFeatures(geojson: any) {
  return {
    ...geojson,
    features: geojson.features.map((f: any) => {
      if (f.geometry?.type === 'Point') {
        const [x, y] = f.geometry.coordinates;
        const [lng, lat] = proj4(ITM_PROJ, WGS84_PROJ, [x, y]);
        return { ...f, geometry: { type: 'Point', coordinates: [lng, lat] } };
      }
      return f;
    }),
  };
}

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

  return makeCircleIcon(color, size, isActive);
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
interface LayerState { railLines: boolean; data333: boolean; traffic: boolean; projects: boolean }
interface StatusVisibility { [status: string]: boolean }

function LayerControlPanel({
  layers, onToggle,
  statusVis, onToggleStatus, statusCounts,
  loading, trafficAvailable, projectCount,
  onToggleAll, allOff,
}: {
  layers: LayerState; onToggle: (k: keyof LayerState) => void;
  statusVis: StatusVisibility; onToggleStatus: (s: string) => void;
  statusCounts: Record<string, number>;
  loading: Record<string, boolean>; trafficAvailable: boolean | null; projectCount: number;
  onToggleAll: () => void; allOff: boolean;
}) {
  const [open, setOpen] = useState(true);

  const base: { key: keyof LayerState; label: string; color: string; isLine?: boolean }[] = [
    { key: 'railLines', label: 'מסילות',                  color: '#3730a3', isLine: true },
    { key: 'data333',   label: 'נתוני 333',                color: '#f97316' },
    { key: 'traffic',   label: 'הסדרי תנועה',              color: '#dc2626', isLine: true },
    { key: 'projects',  label: `פרויקטים (${projectCount})`, color: '#16a34a' },
  ];

  const dot = (color: string, isLine?: boolean) =>
    isLine
      ? <span style={{ display:'inline-block', width:14, height:3, background:color, borderRadius:2 }} />
      : <span style={{ display:'inline-block', width:11, height:11, background:color, borderRadius:'50%' }} />;

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
            {base.map(({ key, label, color, isLine }) => {
              const disabled = key === 'traffic' && trafficAvailable === false;
              return (
                <label key={key} className={`flex items-center gap-2 mb-1.5 cursor-pointer select-none ${disabled ? 'opacity-40' : ''}`}>
                  <input type="checkbox" checked={layers[key]} onChange={() => !disabled && onToggle(key)} disabled={disabled} className="w-3.5 h-3.5 accent-blue-600" />
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    {dot(color, isLine)} {label}
                    {key === 'traffic' && trafficAvailable === null  && <span className="text-[10px] text-gray-400">טוען…</span>}
                    {key === 'traffic' && trafficAvailable === false && <span className="text-[10px] text-gray-400">לא נטען</span>}
                  </span>
                </label>
              );
            })}
          </div>

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
}

export function Map({ points, activePoint, onMarkerClick, projects, activeProject, onProjectClick, statusGeoJSON, activeSegment, onSegmentClick }: MapProps) {
  const center = { lat: 31.8, lng: 34.9 };

  const [data333,      setData333]      = useState<any>(null);
  const [trafficData,  setTrafficData]  = useState<any>(null);
  const [trafficAvail, setTrafficAvail] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({ data333: true, traffic: true });

  const [layers, setLayers] = useState<LayerState>({ railLines: true, data333: true, traffic: true, projects: true });

  const [statusVis, setStatusVis] = useState<StatusVisibility>(() => ({
    ...Object.fromEntries(Object.keys(SEGMENT_STATUS_COLORS).map(s => [s, true])),
    ...Object.fromEntries(Object.keys(STATUS_COLORS).map(s => [`stn_${s}`, true])),
  }));

  const segmentCounts = useMemo<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    (statusGeoJSON?.features ?? []).forEach((f: any) => {
      const s = f.properties?.STATUS_NAM || '';
      if (s) acc[s] = (acc[s] ?? 0) + 1;
    });
    points.forEach(p => { acc[`stn_${p.status}`] = (acc[`stn_${p.status}`] ?? 0) + 1; });
    return acc;
  }, [statusGeoJSON, points]);

  useEffect(() => {
    fetch('/333.geojson')
      .then(r => r.json())
      .then(raw => { setData333(convertITMFeatures(raw)); setLoading(p => ({ ...p, data333: false })); })
      .catch(()  => setLoading(p => ({ ...p, data333: false })));

    fetch('/traffic.geojson')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d  => { setTrafficData(d); setTrafficAvail(true);  setLoading(p => ({ ...p, traffic: false })); })
      .catch(() => { setTrafficAvail(false); setLoading(p => ({ ...p, traffic: false })); });
  }, []);

  const toggleLayer  = (k: keyof LayerState) => setLayers(p => ({ ...p, [k]: !p[k] }));
  const toggleStatus = (s: string)           => setStatusVis(p => ({ ...p, [s]: !p[s] }));

  const allOff = !Object.values(layers).some(v => v) && !Object.values(statusVis).some(v => v);

  const toggleAll = () => {
    if (allOff) {
      setLayers({ railLines: true, data333: true, traffic: true, projects: true });
      setStatusVis(prev => Object.fromEntries(Object.keys(prev).map(k => [k, true])));
    } else {
      setLayers({ railLines: false, data333: false, traffic: false, projects: false });
      setStatusVis(prev => Object.fromEntries(Object.keys(prev).map(k => [k, false])));
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

  const geo333PointToLayer = (_: any, latlng: L.LatLng) =>
    L.circleMarker(latlng, { radius: 5, fillColor: '#f97316', color: '#c2410c', weight: 1, opacity: 1, fillOpacity: 0.8 });

  const geo333EachFeature = (feature: any, layer: L.Layer) => {
    const { NAME, STATUS, TYPE } = feature.properties ?? {};
    if (NAME) (layer as L.CircleMarker).bindPopup(`<div dir="rtl"><strong>${NAME}</strong><br/>סטטוס: ${STATUS ?? '—'}<br/>סוג: ${TYPE ?? '—'}</div>`);
  };

  const trafficStyle = () => ({ color: '#dc2626', weight: 2, opacity: 0.75, dashArray: '6 4' });

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

  const flyTarget = activeSegment?.midpoint ?? activeProject?.location ?? activePoint?.location;

  const visiblePoints = useMemo(
    () => points.filter(p => statusVis[`stn_${p.status}`] ?? true),
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

      {/* 333.geojson */}
      {data333 && layers.data333 && (
        <LeafletGeoJSON key="d333" data={data333} pointToLayer={geo333PointToLayer} onEachFeature={geo333EachFeature} />
      )}

      {/* הסדרי תנועה */}
      {trafficData && layers.traffic && (
        <LeafletGeoJSON key="traffic" data={trafficData} style={trafficStyle}
          onEachFeature={(f, l) => {
            const lbl = f.properties?.NAME || f.properties?.name || f.properties?.DESCRIPTION || 'הסדר תנועה';
            (l as any).bindPopup(`<div dir="rtl"><strong>${lbl}</strong></div>`);
          }}
        />
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
      {layers.projects && projects.filter(p => p.geometry?.type === 'LineString').map(project => {
        const typeClr = projectTypeColor(project.projectType);
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
      {layers.projects && projects.map(project => {
        const active   = activeProject?.id === project.id;
        const typeInfo = PROJECT_TYPES.find(t => t.type === project.projectType);
        const typeLbl  = typeInfo?.label ?? 'פרויקט';
        const typeClr  = projectTypeColor(project.projectType);
        return (
          <Marker key={project.id} position={[project.location.lat, project.location.lng]}
            icon={makeProjectIcon(project.projectType, active)}
            eventHandlers={{ click: () => onProjectClick(project) }}>
            <Popup>
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
                ) : (
                  <table style={{ fontSize:12, color:'#555', marginTop:6, width:'100%', borderCollapse:'collapse' }}>
                    {project.targetYear && <tr><td style={{ color:'#888', paddingBottom:2 }}>שנת יעד</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.targetYear}</td></tr>}
                    {project.cost       && <tr><td style={{ color:'#888', paddingBottom:2 }}>עלות</td><td style={{ paddingRight:8, fontWeight:600 }}>{project.cost}</td></tr>}
                    {project.notes      && <tr><td style={{ color:'#888', paddingBottom:2 }}>הערות</td><td style={{ paddingRight:8 }}>{project.notes}</td></tr>}
                  </table>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}

      <LayerControlPanel
        layers={layers}           onToggle={toggleLayer}
        statusVis={statusVis}     onToggleStatus={toggleStatus}
        statusCounts={segmentCounts}
        loading={loading}         trafficAvailable={trafficAvail}
        projectCount={projects.length}
        onToggleAll={toggleAll}   allOff={allOff}
      />
    </MapContainer>
  );
}
