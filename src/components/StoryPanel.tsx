import { useState } from 'react';
import { StoryPoint, Project, RailSegment, getStatusStyle, getSegmentStyle, PROJECT_TYPES } from '../types';
import { ExternalLink, MapPin, FileText, LayoutDashboard, Calendar, DollarSign, Train, ChevronRight, ChevronLeft, Clock, Wrench, Building2, Maximize2, X } from 'lucide-react';
import { Dashboard } from './Dashboard';
import { toDirectImageUrl } from '../lib/image';

interface Props {
  points: StoryPoint[];         activePoint?: StoryPoint;    onPointSelect: (p: StoryPoint) => void;
  projects: Project[];          activeProject?: Project;     onProjectSelect: (p: Project) => void;
  segments: RailSegment[];      activeSegment?: RailSegment; onSegmentSelect: (s: RailSegment) => void;
  isExpanded: boolean;
}

type Tab = 'stations' | 'rail' | 'projects' | 'dashboard';

const PAGE_RAIL = 10;
const PAGE_PROJ = 8;
const PAGE_STN  = 15;

function Pagination({ page, total, perPage, onPage }: {
  page: number; total: number; perPage: number; onPage: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-2 py-2 border-t border-gray-100 bg-white shrink-0">
      {/* In RTL: first child = right side = "previous" */}
      <button onClick={() => onPage(page - 1)} disabled={page <= 1}
        className="flex items-center gap-0.5 px-2.5 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed font-medium text-gray-600">
        <ChevronRight size={13} /> קודם
      </button>
      <span className="text-xs text-gray-400 font-medium">
        {page} / {totalPages}
        <span className="text-gray-300 mx-1">·</span>
        <span className="text-gray-500">{total} פריטים</span>
      </span>
      <button onClick={() => onPage(page + 1)} disabled={page >= totalPages}
        className="flex items-center gap-0.5 px-2.5 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed font-medium text-gray-600">
        הבא <ChevronLeft size={13} />
      </button>
    </div>
  );
}

export function StoryPanel({ points, activePoint, onPointSelect, projects, activeProject, onProjectSelect, segments, activeSegment, onSegmentSelect, isExpanded }: Props) {
  const [tab,      setTab]      = useState<Tab>('stations');
  const [railPage, setRailPage] = useState(1);
  const [projPage, setProjPage] = useState(1);
  const [stnPage,  setStnPage]  = useState(1);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);

  const switchTab = (t: Tab) => {
    setTab(t);
    setRailPage(1);
    setProjPage(1);
    setStnPage(1);
  };

  // Scroll active item to page
  const activeRailIdx = segments.findIndex(s => s.id === activeSegment?.id);
  const activeRailPage = activeRailIdx >= 0 ? Math.ceil((activeRailIdx + 1) / PAGE_RAIL) : railPage;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; accent: string; count?: number }[] = [
    { key: 'stations',  label: 'תחנות',    icon: <MapPin size={13} />,           accent: 'blue',   count: points.length },
    { key: 'rail',      label: 'מסילות',   icon: <Train size={13} />,            accent: 'indigo', count: segments.length },
    { key: 'projects',  label: 'פרויקטים', icon: <FileText size={13} />,         accent: 'green',  count: projects.length },
    { key: 'dashboard', label: 'דשבורד',   icon: <LayoutDashboard size={13} />,  accent: 'violet' },
  ];

  const accentMap: Record<string, { border: string; text: string; badge: string }> = {
    blue:   { border: 'border-blue-600',   text: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700' },
    indigo: { border: 'border-indigo-600', text: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
    green:  { border: 'border-green-600',  text: 'text-green-600',  badge: 'bg-green-100 text-green-700' },
    violet: { border: 'border-violet-600', text: 'text-violet-600', badge: '' },
  };

  // Pagination slices
  const stnSlice  = points.slice((stnPage - 1) * PAGE_STN,  stnPage  * PAGE_STN);
  const railSlice = segments.slice((activeRailPage - 1) * PAGE_RAIL, activeRailPage * PAGE_RAIL);
  const projSlice = projects.slice((projPage - 1) * PAGE_PROJ, projPage * PAGE_PROJ);

  return (
    <div className="flex flex-col h-full bg-white" dir="rtl">
      {/* ── Tab bar ── */}
      <div className="flex border-b border-gray-200 shrink-0">
        {tabs.map(t => {
          const ac = accentMap[t.accent];
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${active ? `${ac.border} ${ac.text}` : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <span className="flex items-center justify-center gap-1">
                {t.icon} {t.label}
                {t.count !== undefined && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${active && ac.badge ? ac.badge : 'bg-gray-100 text-gray-400'}`}>
                    {t.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── תחנות ── */}
      {tab === 'stations' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3">
            {points.length === 0 && <p className="text-gray-400 text-center mt-8 text-sm">טוען תחנות…</p>}
            {stnSlice.map(point => {
              const st  = getStatusStyle(point.status);
              const act = activePoint?.id === point.id;
              return (
                <div key={point.id} onClick={() => onPointSelect(point)}
                  className={`mb-2 rounded-xl cursor-pointer transition-all duration-200 border-2 overflow-hidden ${act ? 'shadow-sm' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}
                  style={act ? { borderColor: st.color, background: st.color + '11' } : {}}>
                  {point.image && (
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setLightbox({ src: toDirectImageUrl(point.image!), title: point.title }); }}
                      className={`relative w-full group block ${isExpanded ? 'h-48' : 'h-32'}`} title="הגדל תמונה">
                      <img src={toDirectImageUrl(point.image)} alt={point.title} className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors">
                        <Maximize2 size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                      </span>
                    </button>
                  )}
                  <div className="p-3 h-[60px] flex flex-col justify-center">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-gray-800 text-sm truncate leading-tight">{point.title}</h3>
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.bgClass} ${st.textClass}`}>{st.label}</span>
                    </div>
                    {point.link && (
                      <a href={point.link.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-white text-[10px] rounded-md w-fit"
                        style={{ background: st.color }}>
                        {point.link.label} <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={stnPage} total={points.length} perPage={PAGE_STN} onPage={setStnPage} />
        </div>
      )}

      {/* ── מסילות ── */}
      {tab === 'rail' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3">
            {segments.length === 0 && <p className="text-gray-400 text-center mt-8 text-sm">טוען מסילות…</p>}
            {railSlice.map(seg => {
              const st    = getSegmentStyle(seg.statusName);
              const act   = activeSegment?.id === seg.id;
              const lenKm = seg.lengthM > 0 ? (seg.lengthM / 1000).toFixed(1) : null;
              return (
                <div key={seg.id} onClick={() => onSegmentSelect(seg)}
                  className={`mb-2 rounded-xl cursor-pointer transition-all duration-200 border-2 overflow-hidden ${act ? 'shadow-md' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}
                  style={act ? { borderColor: st.color, background: st.color + '11' } : {}}>
                  <div className="p-3 h-[86px] flex flex-col justify-between">
                    {/* row 1: title + badge */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-gray-800 text-sm leading-snug line-clamp-1">{seg.note}</h3>
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.bgClass} ${st.textClass}`}>
                        {st.label}
                      </span>
                    </div>
                    {/* row 2: metadata */}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {lenKm && <span><span className="text-gray-400">אורך:</span> <span className="font-medium text-gray-700">{lenKm} ק"מ</span></span>}
                      {seg.updDate && <span><span className="text-gray-400">עדכון:</span> <span className="font-medium text-gray-700">{seg.updDate}</span></span>}
                      {seg.planNum !== '—' && <span className="truncate"><span className="text-gray-400">תכנית:</span> <span className="font-medium text-gray-700">{seg.planNum}</span></span>}
                    </div>
                    {/* colored bar */}
                    <div className="h-1 rounded-full" style={{ background: st.color + '44' }}>
                      <div className="h-full rounded-full" style={{ background: st.color, width:'100%' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={activeRailPage} total={segments.length} perPage={PAGE_RAIL} onPage={setRailPage} />
        </div>
      )}

      {/* ── פרויקטים ── */}
      {tab === 'projects' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3">
            {projects.length === 0 ? (
              <div className="text-center mt-12 text-gray-400">
                <FileText size={40} className="mx-auto mb-3 opacity-25" />
                <p className="text-sm">אין פרויקטים עדיין</p>
                <p className="text-xs mt-1">לחץ על "הוסף פרויקט" בכותרת</p>
              </div>
            ) : projSlice.map(project => {
              const act       = activeProject?.id === project.id;
              const typeInfo  = PROJECT_TYPES.find(t => t.type === project.projectType);
              const typeClr   = typeInfo?.color ?? '#16a34a';
              const isTraffic  = project.projectType === 'הסדרי_תנועה';
              const isBlockage = project.projectType === 'שדרוג_תשתית';
              const cardH     = (isTraffic || isBlockage) ? 'h-[96px]' : 'h-[86px]';
              return (
                <div key={project.id} onClick={() => onProjectSelect(project)}
                  className={`mb-2 rounded-xl cursor-pointer transition-all duration-200 border-2 overflow-hidden ${act ? 'shadow-sm' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}
                  style={act ? { borderColor: typeClr, background: typeClr + '11' } : {}}>

                  <div className="flex">
                    {/* ── Thumbnail (click to enlarge) ── */}
                    {project.image && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setLightbox({ src: toDirectImageUrl(project.image!), title: project.title }); }}
                        className={`relative shrink-0 group ${isExpanded ? 'w-28' : 'w-20'} ${cardH}`}
                        title="הגדל תמונה">
                        <img
                          src={toDirectImageUrl(project.image)}
                          alt={project.title}
                          className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                          <Maximize2 size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                        </span>
                      </button>
                    )}

                    {isTraffic ? (
                      /* ── Traffic card ── */
                      <div className={`p-3 ${cardH} flex-1 min-w-0 flex flex-col justify-between`}>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-gray-800 text-sm line-clamp-1">{project.title}</h3>
                          <span className="shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5"
                            style={{ background: typeClr + '22', color: typeClr }}>
                            {typeInfo?.icon} {typeInfo?.label}
                          </span>
                        </div>
                        {project.trafficPurpose && (
                          <div className="text-xs text-gray-600 line-clamp-1">
                            <span className="text-gray-400">מטרה: </span>{project.trafficPurpose}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          {project.trafficClosureDate && (
                            <span className="flex items-center gap-1">
                              <Calendar size={10} className="text-red-400" />{project.trafficClosureDate}
                            </span>
                          )}
                          {project.trafficClosureDuration && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} className="text-red-400" />{project.trafficClosureDuration}
                            </span>
                          )}
                          {project.contractor && (
                            <span className="flex items-center gap-1">
                              <Wrench size={10} className="text-gray-400" />{project.contractor}
                            </span>
                          )}
                          {project.managementCompany && (
                            <span className="flex items-center gap-1">
                              <Building2 size={10} className="text-gray-400" />{project.managementCompany}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : isBlockage ? (
                      /* ── Blockage card ── */
                      <div className={`p-3 ${cardH} flex-1 min-w-0 flex flex-col justify-between`}>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-gray-800 text-sm line-clamp-1">{project.title}</h3>
                          <span className="shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5"
                            style={{ background: typeClr + '22', color: typeClr }}>
                            {typeInfo?.icon} {typeInfo?.label}
                          </span>
                        </div>
                        {project.subProject && (
                          <div className="text-xs text-gray-600 line-clamp-1">
                            <span className="text-gray-400">תת פרויקט: </span>{project.subProject}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          {project.initiator && (
                            <span className="flex items-center gap-1">
                              <Building2 size={10} className="text-gray-400" />{project.initiator}
                            </span>
                          )}
                          {project.representative && (
                            <span className="flex items-center gap-1">
                              <Wrench size={10} className="text-gray-400" />{project.representative}
                            </span>
                          )}
                          {project.managementCompany && (
                            <span className="flex items-center gap-1">
                              <Building2 size={10} className="text-gray-400" />{project.managementCompany}
                            </span>
                          )}
                          {project.blockageStatus && (
                            <span className="font-semibold" style={{ color: typeClr }}>{project.blockageStatus}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* ── Regular project card ── */
                      <div className={`p-3 ${cardH} flex-1 min-w-0 flex flex-col justify-between`}>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-gray-800 text-sm line-clamp-1">{project.title}</h3>
                          <span className="shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5"
                            style={{ background: typeClr + '22', color: typeClr }}>
                            {project.targetYear}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {typeInfo && (
                            <span className="flex items-center gap-1 font-medium" style={{ color: typeClr }}>
                              {typeInfo.icon} {typeInfo.label}
                            </span>
                          )}
                          {project.cost && (
                            <span className="flex items-center gap-1 text-gray-500">
                              <DollarSign size={10} className="text-gray-400" />{project.cost}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {project.notes
                            ? <span className="line-clamp-1">{project.notes}</span>
                            : <span className="flex items-center gap-1"><Calendar size={10} />שנת יעד: {project.targetYear}</span>
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={projPage} total={projects.length} perPage={PAGE_PROJ} onPage={setProjPage} />
        </div>
      )}

      {/* ── דשבורד ── */}
      {tab === 'dashboard' && (
        <Dashboard points={points} projects={projects} segments={segments} />
      )}

      {/* ── Lightbox (full-size image) ── */}
      {lightbox && (
        <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)}
            className="absolute top-4 left-4 p-2 rounded-full bg-white/15 hover:bg-white/30 text-white transition-colors">
            <X size={22} />
          </button>
          <a href={lightbox.src} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="absolute top-4 left-14 p-2 rounded-full bg-white/15 hover:bg-white/30 text-white transition-colors"
            title="פתח בטאב חדש">
            <ExternalLink size={22} />
          </a>
          <figure className="max-w-full max-h-full flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.title}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
            <figcaption className="text-white text-sm font-medium text-center">{lightbox.title}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
