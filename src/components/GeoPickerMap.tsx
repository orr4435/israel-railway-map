import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoPoint, GeoGeometry } from '../types';
import { MapPin, Minus, Undo2, Trash2, Crosshair } from 'lucide-react';
import { parseCoords, splitPair, formatCoords, latLngToItm, CoordSystem } from '../lib/coords';

type DrawMode = 'point' | 'polyline';

// Forces Leaflet to recalculate container size (needed inside modals)
function SizeInvalidator() {
  const map = useMap();
  useEffect(() => { setTimeout(() => map.invalidateSize(), 80); }, [map]);
  return null;
}

// Moves the map to a point that was typed in (not on every click)
function FocusPoint({ point, nonce }: { point?: GeoPoint; nonce: number }) {
  const map = useMap();
  useEffect(() => {
    if (nonce && point) map.setView([point.lat, point.lng], Math.max(map.getZoom(), 16));
  }, [nonce]);   // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickHandler({ mode, onAdd }: { mode: DrawMode; onAdd: (p: GeoPoint) => void }) {
  useMapEvents({
    click(e) { onAdd({ lat: e.latlng.lat, lng: e.latlng.lng }); },
  });
  return null;
}

const NODE_ICON = L.divIcon({
  html: `<div style="width:10px;height:10px;background:#4f46e5;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
  className: '', iconSize: [10, 10], iconAnchor: [5, 5],
});

const FIRST_ICON = L.divIcon({
  html: `<div style="width:12px;height:12px;background:#2563eb;border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
  className: '', iconSize: [12, 12], iconAnchor: [6, 6],
});

interface Props {
  mode: DrawMode;
  onModeChange: (m: DrawMode) => void;
  geometry: GeoGeometry | null;
  onGeometryChange: (g: GeoGeometry | null) => void;
  required?: boolean;
  touched?: boolean;
}

export function GeoPickerMap({ mode, onModeChange, geometry, onGeometryChange, required, touched }: Props) {
  const coords = geometry?.coordinates ?? [];

  // ── typed coordinates (latitude/longitude or ITM from the railway GIS) ──
  const [xText, setXText]     = useState('');
  const [yText, setYText]     = useState('');
  const [system, setSystem]   = useState<CoordSystem>('itm');
  const [coordMsg, setCoordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const last = coords[coords.length - 1];

  // show the selected point in the fields, in the system last used
  useEffect(() => {
    if (!last) return;
    const f = formatCoords(last, system);
    setXText(f.x); setYText(f.y);
  }, [last?.lat, last?.lng, system]);   // eslint-disable-line react-hooks/exhaustive-deps

  const placeTyped = () => {
    const r = parseCoords(xText, yText);
    if ('error' in r) { setCoordMsg({ ok: false, text: r.error }); return; }
    setSystem(r.system);
    handleAdd(r.point);
    setFocusNonce(n => n + 1);
    setCoordMsg({ ok: true, text: `${r.system === 'itm' ? 'זוהתה רשת ישראל החדשה (ITM)' : 'זוהו קווי רוחב ואורך (WGS84)'}`
      + `${r.swapped ? '. הערכים היו בסדר הפוך ותוקנו' : ''}. הנקודה הוצבה במפה.` });
  };

  const onPaste = (which: 'x' | 'y') => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pair = splitPair(e.clipboardData.getData('text'));
    if (!pair) return;
    e.preventDefault();
    const [a, b] = which === 'x' ? pair : [pair[1], pair[0]];
    setXText(a); setYText(b); setCoordMsg(null);
  };

  const handleAdd = (p: GeoPoint) => {
    if (mode === 'point') {
      onGeometryChange({ type: 'Point', coordinates: [p] });
    } else {
      const existing = geometry?.type === 'LineString' ? geometry.coordinates : [];
      onGeometryChange({ type: 'LineString', coordinates: [...existing, p] });
    }
  };

  const handleUndo = () => {
    if (coords.length <= 1) { onGeometryChange(null); return; }
    onGeometryChange({ ...geometry!, coordinates: coords.slice(0, -1) });
  };

  const handleClear = () => onGeometryChange(null);

  const handleModeChange = (m: DrawMode) => {
    onModeChange(m);
    onGeometryChange(null);
  };

  // Centroid for fly-to when geometry exists
  const mapCenter: [number, number] = coords.length > 0
    ? [coords[0].lat, coords[0].lng]
    : [31.8, 34.9];

  const isInvalid = required && touched && !geometry;

  const hintText = mode === 'point'
    ? coords.length === 0 ? 'לחץ על המפה לקביעת מיקום' : `📍 נקודה נבחרה`
    : coords.length === 0 ? 'לחץ על המפה להוספת נקודות לקו'
    : coords.length === 1 ? 'הוסף נקודה נוספת לפחות להשלמת הקו'
    : `〰️ ${coords.length} נקודות — לחץ להוספת עוד`;

  return (
    <div className="space-y-2" dir="rtl">
      {/* mode toggle + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          <button type="button" onClick={() => handleModeChange('point')}
            className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors
              ${mode === 'point' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            <MapPin size={12} /> נקודה
          </button>
          <button type="button" onClick={() => handleModeChange('polyline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-r border-gray-200 transition-colors
              ${mode === 'polyline' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            <Minus size={12} /> קו פוליליין
          </button>
        </div>

        <div className="flex items-center gap-1 mr-auto">
          {mode === 'polyline' && coords.length > 0 && (
            <button type="button" onClick={handleUndo} title="בטל נקודה אחרונה"
              className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-gray-100 border border-gray-200">
              <Undo2 size={12} /> בטל
            </button>
          )}
          <button type="button" onClick={handleClear} disabled={!geometry} title="נקה הכל"
            className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-red-500 hover:bg-red-50 border border-red-100 disabled:opacity-30 disabled:cursor-not-allowed">
            <Trash2 size={12} /> נקה
          </button>
        </div>
      </div>

      {/* hint */}
      <p className={`text-[11px] ${isInvalid ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
        {isInvalid ? '⚠ יש לבחור מיקום על המפה' : hintText}
      </p>

      {/* mini-map */}
      <div className={`rounded-xl overflow-hidden border-2 transition-colors ${isInvalid ? 'border-red-300' : 'border-gray-200'}`}
        style={{ height: 220 }}>
        <MapContainer center={mapCenter} zoom={7} style={{ height: '100%', width: '100%' }} zoomControl>
          <TileLayer
            attribution='&copy; <a href="https://www.waze.com">Waze</a>'
            url="https://il-livemap-tiles3.waze.com/tiles/{z}/{x}/{y}.png"
          />
          <SizeInvalidator />
          <FocusPoint point={last} nonce={focusNonce} />
          <ClickHandler mode={mode} onAdd={handleAdd} />

          {/* render geometry */}
          {geometry?.type === 'Point' && coords[0] && (
            <Marker position={[coords[0].lat, coords[0].lng]} icon={FIRST_ICON} />
          )}
          {geometry?.type === 'LineString' && coords.length > 0 && (
            <>
              {coords.map((c, i) => (
                <Marker key={i} position={[c.lat, c.lng]} icon={i === 0 ? FIRST_ICON : NODE_ICON} />
              ))}
              {coords.length > 1 && (
                <Polyline
                  positions={coords.map(c => [c.lat, c.lng] as [number, number])}
                  color="#4f46e5" weight={2.5} dashArray="7 4"
                />
              )}
            </>
          )}
        </MapContainer>
      </div>

      {/* typed coordinates */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-gray-600">הזנת קואורדינטות {mode === 'polyline' && <span className="font-normal text-gray-400">(מוסיף נקודה לקו)</span>}</p>
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-[11px]">
            {(['itm', 'wgs84'] as CoordSystem[]).map(sys => (
              <button key={sys} type="button" onClick={() => setSystem(sys)}
                className={`px-2 py-0.5 ${system === sys ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                {sys === 'itm' ? 'רשת ישראל (ITM)' : 'רוחב/אורך'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-[11px] text-gray-500 mb-0.5">{system === 'itm' ? 'X (מזרח)' : 'אורך (Longitude)'}</label>
            <input value={xText} onChange={e => { setXText(e.target.value); setCoordMsg(null); }} onPaste={onPaste('x')}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); placeTyped(); } }}
              dir="ltr" inputMode="decimal" placeholder={system === 'itm' ? '180590' : '34.7928'}
              className="w-full px-2 py-1.5 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] text-gray-500 mb-0.5">{system === 'itm' ? 'Y (צפון)' : 'רוחב (Latitude)'}</label>
            <input value={yText} onChange={e => { setYText(e.target.value); setCoordMsg(null); }} onPaste={onPaste('y')}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); placeTyped(); } }}
              dir="ltr" inputMode="decimal" placeholder={system === 'itm' ? '664465' : '32.0728'}
              className="w-full px-2 py-1.5 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <button type="button" onClick={placeTyped} disabled={!xText.trim() || !yText.trim()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap">
            <Crosshair size={14} /> הצב במפה
          </button>
        </div>
        {coordMsg
          ? <p className={`text-[11px] ${coordMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{coordMsg.text}</p>
          : <p className="text-[11px] text-gray-400">אפשר להדביק זוג קואורדינטות לשדה אחד. המערכת מזהה לבד ITM או רוחב/אורך, ומתקנת סדר הפוך.</p>}
      </div>

      {/* coordinate summary */}
      {geometry && (
        <div className="text-[10px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5 font-mono leading-relaxed" dir="ltr">
          {geometry.type === 'Point'
            ? (() => { const t = latLngToItm(coords[0]); return `📍 ${coords[0].lat.toFixed(6)}, ${coords[0].lng.toFixed(6)}   ·   ITM ${t.x.toFixed(1)}, ${t.y.toFixed(1)}`; })()
            : coords.map((c, i) => `${i + 1}) ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`).join('  →  ')
          }
        </div>
      )}
    </div>
  );
}
