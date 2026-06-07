import { useMemo } from 'react';
import { StoryPoint, Project, RailSegment, STATUS_COLORS, SEGMENT_STATUS_COLORS, getStatusStyle, getSegmentStyle } from '../types';
import { Train, FolderKanban, MapPin, Calendar, DollarSign, Ruler } from 'lucide-react';

interface Props {
  points: StoryPoint[];
  projects: Project[];
  segments: RailSegment[];
}

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number | string; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="p-2 rounded-lg shrink-0" style={{ background: color + '22' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-800 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Dashboard({ points, projects, segments }: Props) {
  // ── Aggregations ──────────────────────────────────────────────────────────
  const stationByStatus = useMemo(() => {
    const acc: Record<string, number> = {};
    points.forEach(p => { acc[p.status] = (acc[p.status] ?? 0) + 1; });
    return acc;
  }, [points]);

  const segmentByStatus = useMemo(() => {
    const acc: Record<string, number> = {};
    segments.forEach(s => { acc[s.statusName] = (acc[s.statusName] ?? 0) + 1; });
    return acc;
  }, [segments]);

  const totalLengthKm = useMemo(
    () => segments.reduce((sum, s) => sum + (s.lengthM > 0 ? s.lengthM / 1000 : 0), 0),
    [segments]
  );

  const activeStations = (stationByStatus['נוסעים'] ?? 0) + (stationByStatus['תפעולית'] ?? 0);
  const activePct      = points.length > 0 ? Math.round((activeStations / points.length) * 100) : 0;

  const existingSegments = segmentByStatus['קיים'] ?? 0;
  const existingLenKm   = segments
    .filter(s => s.statusName === 'קיים')
    .reduce((sum, s) => sum + (s.lengthM > 0 ? s.lengthM / 1000 : 0), 0);

  const sortedStationStatuses = [
    ...Object.keys(STATUS_COLORS).filter(s => stationByStatus[s]),
    ...Object.keys(stationByStatus).filter(s => !STATUS_COLORS[s]),
  ];
  const sortedSegmentStatuses = [
    ...Object.keys(SEGMENT_STATUS_COLORS).filter(s => segmentByStatus[s]),
    ...Object.keys(segmentByStatus).filter(s => !SEGMENT_STATUS_COLORS[s]),
  ];

  const maxStn = Math.max(...Object.values(stationByStatus), 1);
  const maxSeg = Math.max(...Object.values(segmentByStatus), 1);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5" dir="rtl">

      {/* ── כרטיסי סיכום ── */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<MapPin size={16}  />} value={points.length}           label="תחנות"        color="#2563eb" />
        <StatCard icon={<Train size={16}   />} value={segments.length}         label="מקטעי מסילה"  color="#4f46e5" />
        <StatCard icon={<Ruler size={16}   />} value={`${totalLengthKm.toFixed(0)} ק״מ`} label='סה"כ אורך מסילה' color="#0d9488" />
        <StatCard icon={<FolderKanban size={16}/>} value={projects.length}     label="פרויקטים"     color="#16a34a" />
      </div>

      {/* ── תחנות לפי סטטוס ── */}
      <section>
        <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1.5">
          <MapPin size={13} /> תחנות לפי סטטוס
        </h3>
        {points.length === 0
          ? <p className="text-xs text-gray-400 text-center py-3">טוען…</p>
          : <div className="space-y-1.5">
              {sortedStationStatuses.map(status => {
                const st    = getStatusStyle(status);
                const count = stationByStatus[status] ?? 0;
                const pct   = points.length > 0 ? Math.round((count / points.length) * 100) : 0;
                return (
                  <div key={status} className="flex items-center gap-2">
                    <span className="shrink-0 rounded-full" style={{ width:9, height:9, background:st.color }} />
                    <span className="text-xs text-gray-700 w-24 shrink-0 truncate">{st.label}</span>
                    <HBar value={count} max={maxStn} color={st.color} />
                    <span className="text-xs font-semibold text-gray-700 w-5 shrink-0 text-left">{count}</span>
                    <span className="text-xs text-gray-400 w-8 shrink-0 text-left">{pct}%</span>
                  </div>
                );
              })}
            </div>
        }

        {/* active-stations bar */}
        {points.length > 0 && (
          <div className="mt-3 rounded-lg bg-blue-50 border border-blue-100 p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-blue-700">תחנות פעילות (נוסעים + תפעולי)</p>
              <p className="text-sm font-bold text-blue-800">{activePct}%</p>
            </div>
            <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${activePct}%` }} />
            </div>
            <p className="text-[11px] text-blue-400 mt-1">{activeStations} מתוך {points.length}</p>
          </div>
        )}
      </section>

      {/* ── מסילות לפי סטטוס ── */}
      <section>
        <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1.5">
          <Train size={13} /> מסילות לפי סטטוס
        </h3>
        {segments.length === 0
          ? <p className="text-xs text-gray-400 text-center py-3">טוען…</p>
          : <div className="space-y-1.5">
              {sortedSegmentStatuses.map(status => {
                const st    = getSegmentStyle(status);
                const count = segmentByStatus[status] ?? 0;
                const pct   = segments.length > 0 ? Math.round((count / segments.length) * 100) : 0;
                const lenKm = segments
                  .filter(s => s.statusName === status)
                  .reduce((sum, s) => sum + (s.lengthM > 0 ? s.lengthM / 1000 : 0), 0);
                return (
                  <div key={status} className="flex items-center gap-2">
                    <span className="shrink-0 rounded-sm" style={{ width:14, height:3, background:st.color }} />
                    <span className="text-xs text-gray-700 w-28 shrink-0 truncate">{st.label}</span>
                    <HBar value={count} max={maxSeg} color={st.color} />
                    <span className="text-xs font-semibold text-gray-700 w-4 shrink-0 text-left">{count}</span>
                    <span className="text-xs text-gray-400 w-14 shrink-0 text-left">{lenKm.toFixed(0)} ק"מ</span>
                  </div>
                );
              })}
            </div>
        }

        {/* existing rail summary */}
        {existingSegments > 0 && (
          <div className="mt-3 rounded-lg bg-teal-50 border border-teal-100 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-teal-700">מסילות קיימות</p>
              <p className="text-sm font-bold text-teal-800">{existingLenKm.toFixed(0)} ק"מ</p>
            </div>
            <p className="text-[11px] text-teal-400 mt-0.5">{existingSegments} מקטעים</p>
          </div>
        )}
      </section>

      {/* ── פרויקטים אחרונים ── */}
      <section>
        <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1.5">
          <FolderKanban size={13} /> פרויקטים
        </h3>
        {projects.length === 0
          ? <div className="text-center py-5 text-gray-400">
              <FolderKanban size={28} className="mx-auto mb-2 opacity-25" />
              <p className="text-xs">אין פרויקטים עדיין</p>
            </div>
          : [...projects]
              .sort((a, b) => Number(b.id.split('-')[1]) - Number(a.id.split('-')[1]))
              .slice(0, 6)
              .map(proj => (
                <div key={proj.id} className="mb-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
                  <p className="text-sm font-semibold text-green-800 truncate">{proj.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-green-600">
                    <span className="flex items-center gap-1"><Calendar size={10} />{proj.targetYear}</span>
                    <span className="flex items-center gap-1"><DollarSign size={10} />{proj.cost}</span>
                  </div>
                  {proj.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{proj.notes}</p>}
                </div>
              ))
        }
      </section>
    </div>
  );
}
