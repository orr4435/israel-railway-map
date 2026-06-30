// ── Geographic primitives ─────────────────────────────────────────────────────
export interface GeoPoint { lat: number; lng: number }

export interface GeoGeometry {
  type: 'Point' | 'LineString';
  coordinates: GeoPoint[];   // Point: 1 item; LineString: 2+ items
}

/** Return the representative marker position for any geometry */
export function locationFromGeometry(g: GeoGeometry): GeoPoint {
  if (g.coordinates.length === 0) return { lat: 31.8, lng: 34.9 };
  return g.coordinates[Math.floor(g.coordinates.length / 2)];
}

// ── StoryPoint (תחנות) ────────────────────────────────────────────────────────
export interface StoryPoint {
  id: string;
  title: string;
  description: string;
  status: string;
  location: GeoPoint;
  geometry?: GeoGeometry;   // drawn geometry (point or polyline)
  image?: string;
  link?: { url: string; label: string };
}

// ── Project types ────────────────────────────────────────────────────────────
export type ProjectType = 'פיתוח_תחנה' | 'הקמת_מסילה' | 'הסדרי_תנועה' | 'שדרוג_תשתית' | 'אחר';

export const PROJECT_TYPES: { type: ProjectType; label: string; color: string; icon: string; desc: string }[] = [
  { type: 'פיתוח_תחנה',  label: 'פיתוח תחנה',   color: '#2563eb', icon: '🚉', desc: 'בנייה ושדרוג תחנות'   },
  { type: 'הקמת_מסילה',  label: 'הקמת מסילה',   color: '#7c3aed', icon: '🛤️', desc: 'סלילת מסילות חדשות'  },
  { type: 'הסדרי_תנועה', label: 'הסדרי תנועה',  color: '#dc2626', icon: '🚦', desc: 'ניהול תנועה ומעברים' },
  { type: 'שדרוג_תשתית', label: 'חסמים',         color: '#d97706', icon: '🚧', desc: 'חסמים ומניעת גישה'   },
  { type: 'אחר',          label: 'אחר',           color: '#6b7280', icon: '📋', desc: 'פרויקטים מגוונים'    },
];

// ── Project (פרויקטים) ────────────────────────────────────────────────────────
export interface Project {
  id: string;
  title: string;
  projectType?: ProjectType;
  location: GeoPoint;
  geometry?: GeoGeometry;

  // Regular project fields
  targetYear?: string;
  cost?: string;

  // Traffic-arrangement specific fields (used when projectType === 'הסדרי_תנועה')
  trafficPurpose?: string;        // מטרת ההסדר
  trafficClosureDate?: string;    // מועד סגירה משוער
  trafficClosureDuration?: string;// משך סגירה משוער
  contractor?: string;            // קבלן
  managementCompany?: string;     // חברת ניהול (also used for חסמים)

  // Blockage-specific fields (used when projectType === 'שדרוג_תשתית')
  subProject?: string;            // תת פרויקט
  initiator?: string;             // יזם
  representative?: string;        // נציג
  blockageStatus?: string;        // סטטוס

  image?: string;
  notes?: string;
}

// ── RailSegment (מסילות — from status.geojson) ───────────────────────────────
export interface RailSegment {
  id: string;
  note: string;          // NOTE  — route name e.g. "דימונה - ירוחם"
  statusName: string;    // STATUS_NAM
  planNum: string;       // PLAN_NUM
  lengthM: number;       // TTLLENKM — despite name, value is in metres
  updDate: string;       // MGN_UPD
  branchNo: number;      // BRANCHNO
  midpoint: { lat: number; lng: number };
  feature: any;          // original GeoJSON feature (for map highlight)
}

export interface StoryData {
  title: string;
  description: string;
  points: StoryPoint[];
}

// ── Station status palette ────────────────────────────────────────────────────
export interface StatusStyle {
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  label: string;
}

export const STATUS_COLORS: Record<string, StatusStyle> = {
  'נוסעים':       { color: '#2563eb', bgClass: 'bg-blue-100',   textClass: 'text-blue-700',   borderClass: 'border-blue-400',   label: 'נוסעים' },
  'תפעולית':      { color: '#0d9488', bgClass: 'bg-teal-100',   textClass: 'text-teal-700',   borderClass: 'border-teal-400',   label: 'תפעולית' },
  'בתכנון':       { color: '#d97706', bgClass: 'bg-amber-100',  textClass: 'text-amber-700',  borderClass: 'border-amber-400',  label: 'בתכנון' },
  'מסוף מטענים': { color: '#7c3aed', bgClass: 'bg-violet-100', textClass: 'text-violet-700', borderClass: 'border-violet-400', label: 'מסוף מטענים' },
  'הסטורית':      { color: '#6b7280', bgClass: 'bg-gray-100',   textClass: 'text-gray-600',   borderClass: 'border-gray-400',   label: 'היסטורית' },
};

export const DEFAULT_STATUS: StatusStyle = {
  color: '#9ca3af', bgClass: 'bg-gray-100', textClass: 'text-gray-500',
  borderClass: 'border-gray-300', label: 'אחר',
};

export function getStatusStyle(status: string): StatusStyle {
  return STATUS_COLORS[status] ?? DEFAULT_STATUS;
}

// ── Segment (rail-line) status palette — STATUS_NAM values ───────────────────
export interface SegmentStyle {
  color: string;
  bgClass: string;
  textClass: string;
  label: string;
}

export const SEGMENT_STATUS_COLORS: Record<string, SegmentStyle> = {
  'קיים':                  { color: '#0d9488', bgClass: 'bg-teal-100',   textClass: 'text-teal-700',   label: 'קיים' },
  'בהקמה':                 { color: '#ea580c', bgClass: 'bg-orange-100', textClass: 'text-orange-700', label: 'בהקמה' },
  'מאושר בתכנית מפורטת':  { color: '#2563eb', bgClass: 'bg-blue-100',   textClass: 'text-blue-700',   label: 'מאושר בתכנית מפורטת' },
  'מאושר תמא 23':          { color: '#7c3aed', bgClass: 'bg-violet-100', textClass: 'text-violet-700', label: 'מאושר תמ"א 23' },
  'בהפקדה':                { color: '#4f46e5', bgClass: 'bg-indigo-100', textClass: 'text-indigo-700', label: 'בהפקדה' },
  'מתוכנן':                { color: '#d97706', bgClass: 'bg-amber-100',  textClass: 'text-amber-700',  label: 'מתוכנן' },
  'בתכנון':                { color: '#ca8a04', bgClass: 'bg-yellow-100', textClass: 'text-yellow-700', label: 'בתכנון' },
  'הכנה 77-78':            { color: '#9333ea', bgClass: 'bg-purple-100', textClass: 'text-purple-700', label: 'הכנה 77–78' },
  'היסטורי':               { color: '#6b7280', bgClass: 'bg-gray-100',   textClass: 'text-gray-600',   label: 'היסטורי' },
};

export const DEFAULT_SEGMENT: SegmentStyle = {
  color: '#9ca3af', bgClass: 'bg-gray-100', textClass: 'text-gray-500', label: 'לא ידוע',
};

export function getSegmentStyle(statusName: string): SegmentStyle {
  return SEGMENT_STATUS_COLORS[statusName] ?? DEFAULT_SEGMENT;
}
