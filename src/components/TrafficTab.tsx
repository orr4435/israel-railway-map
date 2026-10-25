import { Fragment, useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronUp, MapPin, Phone, Building2, StickyNote, Wrench, Clock, Target, AlertTriangle, X } from 'lucide-react';
import { Project } from '../types';
import { TRAFFIC_STATUS, TRAFFIC_STATUS_ORDER, TrafficStatus, getTrafficStatus, formatDate, parseDate } from '../lib/traffic';

interface Props {
  arrangements: Project[];               // traffic arrangements only, locations already resolved
  activeProject?: Project;
  onSelect: (p: Project) => void;
  isExpanded: boolean;
}

export function StatusBadge({ status, small }: { status: TrafficStatus; small?: boolean }) {
  const st = TRAFFIC_STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${st.bg} ${st.text} ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'}`}>
      {status === 'no_end'
        ? <AlertTriangle size={small ? 10 : 11} />
        : <span className="rounded-full" style={{ width: 7, height: 7, background: st.color }} />}
      {st.label}
    </span>
  );
}

/** Turns phone numbers inside free text into tel: links */
function withPhoneLinks(text: string) {
  const parts = text.split(/(\+?\d[\d\s-]{7,}\d)/g);
  return parts.map((part, i) =>
    /^\+?\d[\d\s-]{7,}\d$/.test(part)
      ? <a key={i} href={`tel:${part.replace(/[\s-]/g, '')}`} className="text-blue-600 hover:underline" dir="ltr" onClick={e => e.stopPropagation()}>{part}</a>
      : <Fragment key={i}>{part}</Fragment>);
}

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-gray-400 font-medium">{label}</p>
        <div className="text-gray-700 whitespace-pre-line break-words">{children}</div>
      </div>
    </div>
  );
}

export function TrafficTab({ arrangements, activeProject, onSelect, isExpanded }: Props) {
  const [query,     setQuery]     = useState('');
  const [statusSet, setStatusSet] = useState<Set<TrafficStatus>>(new Set());
  const [initiator, setInitiator] = useState('');
  const [openId,    setOpenId]    = useState<string | null>(null);

  const rows = useMemo(() => arrangements.map(p => ({ p, status: getTrafficStatus(p) })), [arrangements]);

  const counts = useMemo(() => {
    const c: Record<TrafficStatus, number> = { upcoming: 0, active: 0, ended: 0, no_end: 0 };
    rows.forEach(r => c[r.status]++);
    return c;
  }, [rows]);

  const initiators = useMemo(
    () => [...new Set(arrangements.map(p => p.initiator?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'he')),
    [arrangements]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(r => statusSet.size === 0 || statusSet.has(r.status))
      .filter(r => !initiator || r.p.initiator?.trim() === initiator)
      .filter(r => !q || [r.p.title, r.p.locationName, r.p.matchedStation, r.p.initiator, r.p.contacts, r.p.contractor,
                          r.p.managementCompany, r.p.trafficPurpose, r.p.notes]
                          .some(v => v?.toLowerCase().includes(q)))
      .sort((a, b) =>
        TRAFFIC_STATUS_ORDER.indexOf(a.status) - TRAFFIC_STATUS_ORDER.indexOf(b.status) ||
        (parseDate(a.p.trafficStartDate ?? a.p.trafficClosureDate)?.getTime() ?? Infinity) -
        (parseDate(b.p.trafficStartDate ?? b.p.trafficClosureDate)?.getTime() ?? Infinity));
  }, [rows, query, statusSet, initiator]);

  const toggleStatus = (s: TrafficStatus) => setStatusSet(prev => {
    const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next;
  });
  const anyFilter = query || statusSet.size > 0 || initiator;

  const clickRow = (p: Project) => {
    setOpenId(id => (id === p.id ? null : p.id));
    onSelect(p);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden" dir="rtl">
      {/* ── search and filters ── */}
      <div className="p-3 border-b border-gray-100 space-y-2 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש לפי שם, מיקום, יזם, איש קשר…"
            className="w-full pr-8 pl-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200" />
          {query && (
            <button onClick={() => setQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="נקה">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {TRAFFIC_STATUS_ORDER.map(s => {
            const st = TRAFFIC_STATUS[s], on = statusSet.has(s);
            return (
              <button key={s} onClick={() => toggleStatus(s)}
                className={`flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-1 border transition-colors ${on ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                style={on ? { background: st.color, borderColor: st.color } : { borderColor: st.color + '66' }}>
                {s === 'no_end' ? <AlertTriangle size={11} style={{ color: on ? '#fff' : st.color }} />
                                : <span className="rounded-full" style={{ width: 7, height: 7, background: on ? '#fff' : st.color }} />}
                {st.label} <span className="opacity-70">{counts[s]}</span>
              </button>
            );
          })}
          {initiators.length > 0 && (
            <select value={initiator} onChange={e => setInitiator(e.target.value)}
              className="text-[11px] border border-gray-200 rounded-full px-2 py-1 bg-white text-gray-600">
              <option value="">כל היזמים</option>
              {initiators.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          )}
          {anyFilter && (
            <button onClick={() => { setQuery(''); setStatusSet(new Set()); setInitiator(''); }}
              className="text-[11px] text-gray-400 hover:text-gray-700 underline">נקה סינון</button>
          )}
        </div>
      </div>

      {/* ── table ── */}
      <div className="flex-1 overflow-y-auto">
        {arrangements.length === 0 ? (
          <p className="text-gray-400 text-center mt-10 text-sm">אין הסדרי תנועה להצגה</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-center mt-10 text-sm">לא נמצאו הסדרים התואמים לסינון</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-[11px] text-gray-500 text-right">
                <th className="font-semibold px-3 py-2">שם ההסדר</th>
                {isExpanded && <th className="font-semibold px-2 py-2">מיקום</th>}
                <th className="font-semibold px-2 py-2 whitespace-nowrap">התחלה</th>
                <th className="font-semibold px-2 py-2 whitespace-nowrap">סיום</th>
                <th className="font-semibold px-2 py-2">סטטוס</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ p, status }) => {
                const open = openId === p.id, active = activeProject?.id === p.id;
                const st = TRAFFIC_STATUS[status];
                const where = p.locationName || p.matchedStation;
                return (
                  <Fragment key={p.id}>
                    <tr onClick={() => clickRow(p)}
                      className={`cursor-pointer border-b border-gray-100 transition-colors ${active ? '' : 'hover:bg-gray-50'}`}
                      style={active ? { background: st.color + '14' } : undefined}>
                      <td className="px-3 py-2 align-top" style={{ borderRight: `3px solid ${st.color}` }}>
                        <p className="font-semibold text-gray-800 leading-snug">{p.title}</p>
                        {!isExpanded && where && <p className="text-[11px] text-gray-400 truncate max-w-[14rem]">{where}</p>}
                        {p.locationSource === 'none' && (
                          <p className="text-[10px] text-amber-600">לא אותר במפה</p>
                        )}
                      </td>
                      {isExpanded && <td className="px-2 py-2 text-xs text-gray-600 align-top">{where || '—'}</td>}
                      <td className="px-2 py-2 text-xs text-gray-600 whitespace-nowrap align-top tabular-nums">{formatDate(p.trafficStartDate)}</td>
                      <td className="px-2 py-2 text-xs text-gray-600 whitespace-nowrap align-top tabular-nums">{formatDate(p.trafficClosureDate)}</td>
                      <td className="px-2 py-2 align-top"><StatusBadge status={status} small={!isExpanded} /></td>
                      <td className="px-1 py-2 align-top text-gray-400">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-gray-100" style={{ background: st.color + '0a' }}>
                        <td colSpan={isExpanded ? 6 : 5} className="px-4 py-3">
                          <div className={`grid gap-3 ${isExpanded ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            <Detail icon={<Phone size={13} />} label="אנשי קשר וטלפונים">
                              {p.contacts ? withPhoneLinks(p.contacts) : <span className="text-gray-400">לא הוזנו</span>}
                            </Detail>
                            <Detail icon={<Building2 size={13} />} label="יזם ההסדר">
                              {p.initiator || <span className="text-gray-400">לא הוזן</span>}
                            </Detail>
                            <Detail icon={<StickyNote size={13} />} label="הערות">
                              {p.notes || <span className="text-gray-400">אין הערות</span>}
                            </Detail>
                            {where && (
                              <Detail icon={<MapPin size={13} />} label="מיקום">
                                {where}
                                {p.matchedStation && p.matchedStation !== where && <span className="text-gray-400"> · תחנת {p.matchedStation}</span>}
                              </Detail>
                            )}
                            {p.trafficPurpose && <Detail icon={<Target size={13} />} label="מטרת ההסדר">{p.trafficPurpose}</Detail>}
                            {p.trafficClosureDuration && <Detail icon={<Clock size={13} />} label="משך סגירה">{p.trafficClosureDuration}</Detail>}
                            {(p.contractor || p.managementCompany) && (
                              <Detail icon={<Wrench size={13} />} label="קבלן וחברת ניהול">
                                {[p.contractor, p.managementCompany].filter(Boolean).join(' · ')}
                              </Detail>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-400 shrink-0">
        מוצגים {filtered.length} מתוך {arrangements.length} הסדרים
      </div>
    </div>
  );
}
