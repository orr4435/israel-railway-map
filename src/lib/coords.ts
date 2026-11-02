import proj4 from 'proj4';
import { GeoPoint } from '../types';

/** Israeli Transverse Mercator (ITM, EPSG:2039), the grid used by Israeli GIS systems including the railway's. */
const ITM = '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 '
          + '+y_0=626907.39 +ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs';

export type CoordSystem = 'wgs84' | 'itm';

export function itmToLatLng(x: number, y: number): GeoPoint {
  const [lng, lat] = proj4(ITM, 'WGS84', [x, y]);
  return { lat, lng };
}

export function latLngToItm(p: GeoPoint): { x: number; y: number } {
  const [x, y] = proj4('WGS84', ITM, [p.lng, p.lat]);
  return { x, y };
}

// Israel and surroundings, generous margins
const inLat = (v: number) => v >= 29 && v <= 33.6;
const inLng = (v: number) => v >= 34 && v <= 36;
const inX   = (v: number) => v >= 100_000 && v <= 300_000;   // ITM easting
const inY   = (v: number) => v >= 350_000 && v <= 820_000;   // ITM northing

function num(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Splits "34.78, 32.08" or "180000 650000" pasted into one field. */
export function splitPair(text: string): [string, string] | null {
  const parts = text.trim().split(/[\s,;]+/).filter(Boolean);
  return parts.length === 2 && parts.every(p => num(p) !== null) ? [parts[0], parts[1]] : null;
}

export type ParsedCoords = { point: GeoPoint; system: CoordSystem; swapped: boolean } | { error: string };

/**
 * Reads a pair typed or pasted as X (east) and Y (north), either latitude/longitude or ITM metres.
 * The system is detected from the size of the numbers, and a swapped pair is fixed.
 */
export function parseCoords(xText: string, yText: string): ParsedCoords {
  const x = num(xText), y = num(yText);
  if (x === null || y === null) return { error: 'יש להזין שני מספרים' };

  if (Math.abs(x) < 1000 && Math.abs(y) < 1000) {                   // degrees
    if (inLng(x) && inLat(y)) return { point: { lat: y, lng: x }, system: 'wgs84', swapped: false };
    if (inLat(x) && inLng(y)) return { point: { lat: x, lng: y }, system: 'wgs84', swapped: true };
    return { error: 'הקואורדינטות אינן בתחום ישראל (רוחב 29 עד 33.6, אורך 34 עד 36)' };
  }
  if (inX(x) && inY(y)) return { point: itmToLatLng(x, y), system: 'itm', swapped: false };
  if (inY(x) && inX(y)) return { point: itmToLatLng(y, x), system: 'itm', swapped: true };
  return { error: 'לא זוהתה רשת ישראל החדשה (X בין 100,000 ל-300,000, Y בין 350,000 ל-820,000)' };
}

export function formatCoords(p: GeoPoint, system: CoordSystem): { x: string; y: string } {
  if (system === 'itm') { const { x, y } = latLngToItm(p); return { x: x.toFixed(1), y: y.toFixed(1) }; }
  return { x: p.lng.toFixed(6), y: p.lat.toFixed(6) };
}
