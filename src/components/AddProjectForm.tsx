import React, { useState } from 'react';
import { Project, PROJECT_TYPES, ProjectType, GeoGeometry, locationFromGeometry } from '../types';
import { X, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { GeoPickerMap } from './GeoPickerMap';
import { toDirectImageUrl, isUnsupportedImageUrl } from '../lib/image';
import { parseDate, toInputDate, hasCoords } from '../lib/traffic';

interface AddProjectFormProps {
  onSubmit: (project: Omit<Project, 'id'>) => void;
  onClose: () => void;
  initial?: Project;        // edit mode: the form starts filled with this record
}

/** Keeps a stored value visible in a fixed <select> list even when it is not one of the options. */
function CurrentOption({ value, known }: { value: string; known: string[] }) {
  return value && !known.includes(value) ? <option>{value}</option> : null;
}

/** The record's own geometry, or a point at its own coordinates. A position borrowed from a matched station is not its own. */
function initialGeometry(p?: Project): GeoGeometry | null {
  if (!p) return null;
  if (p.geometry) return p.geometry;
  if (p.locationSource !== 'station' && hasCoords(p.location)) return { type: 'Point', coordinates: [p.location] };
  return null;
}

type DrawMode = 'point' | 'polyline';

const IS_TRAFFIC  = (t: ProjectType) => t === 'הסדרי_תנועה';
const IS_BLOCKAGE = (t: ProjectType) => t === 'שדרוג_תשתית';

export function AddProjectForm({ onSubmit, onClose, initial }: AddProjectFormProps) {
  const editing = !!initial;
  const [projectType, setProjectType] = useState<ProjectType>(initial?.projectType ?? 'אחר');

  // common fields
  const [title,     setTitle]     = useState(initial?.title ?? '');
  const [image,     setImage]     = useState(initial?.image ?? '');
  const [notes,     setNotes]     = useState(initial?.notes ?? '');
  const [geometry,  setGeometry]  = useState<GeoGeometry | null>(() => initialGeometry(initial));
  const [drawMode,  setDrawMode]  = useState<DrawMode>(initial?.geometry?.type === 'LineString' ? 'polyline' : 'point');
  const [submitted, setSubmitted] = useState(false);

  // regular project fields
  const [targetYear, setTargetYear] = useState(initial?.targetYear ?? '');
  const [cost,       setCost]       = useState(initial?.cost ?? '');

  // traffic-arrangement fields
  const [trafficPurpose,         setTrafficPurpose]         = useState(initial?.trafficPurpose ?? '');
  const [trafficStartDate,       setTrafficStartDate]       = useState(toInputDate(initial?.trafficStartDate));
  const [trafficClosureDate,     setTrafficClosureDate]     = useState(toInputDate(initial?.trafficClosureDate));
  const [locationName,           setLocationName]           = useState(initial?.locationName ?? '');
  const [trafficInitiator,       setTrafficInitiator]       = useState(initial?.projectType === 'הסדרי_תנועה' ? (initial?.initiator ?? '') : '');
  const [contacts,               setContacts]               = useState(initial?.contacts ?? '');
  const [trafficClosureDuration, setTrafficClosureDuration] = useState(initial?.trafficClosureDuration ?? '');
  const [contractor]                                         = useState(initial?.contractor ?? '');   // no longer in the form; kept on edit
  const [department,             setDepartment]             = useState(initial?.department ?? '');
  const [adminHead,              setAdminHead]              = useState(initial?.adminHead ?? '');
  const [arrangementStatus,      setArrangementStatus]      = useState(initial?.arrangementStatus ?? '');
  const [managementCompany,      setManagementCompany]      = useState(initial?.managementCompany ?? '');

  // blockage (חסמים) fields
  const [subProject,     setSubProject]     = useState(initial?.subProject ?? '');
  const [initiator,      setInitiator]      = useState(initial?.projectType === 'שדרוג_תשתית' ? (initial?.initiator ?? '') : '');
  const [representative, setRepresentative] = useState(initial?.representative ?? '');
  const [blockageStatus, setBlockageStatus] = useState(initial?.blockageStatus ?? '');

  const isTraffic  = IS_TRAFFIC(projectType);
  const isBlockage = IS_BLOCKAGE(projectType);

  const handleTypeChange = (t: ProjectType) => {
    setProjectType(t);
    if (t === 'הקמת_מסילה') setDrawMode('polyline');
    else setDrawMode('point');
    setGeometry(null);
  };

  // a traffic arrangement may be placed by its station/location name instead of a point on the map
  const placedByName = isTraffic && !geometry && !!locationName.trim();
  const datesInvalid = isTraffic && !!trafficStartDate && !!trafficClosureDate &&
    (parseDate(trafficClosureDate)?.getTime() ?? 0) < (parseDate(trafficStartDate)?.getTime() ?? 0);

  const validate = () => {
    if (datesInvalid) return false;
    if (placedByName) return true;
    if (!geometry) return false;
    if (geometry.type === 'LineString' && geometry.coordinates.length < 2) return false;
    if (!isTraffic && !isBlockage && (!targetYear.trim() || !cost.trim())) return false;
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!validate()) return;

    const location = geometry ? locationFromGeometry(geometry) : { lat: 0, lng: 0 };
    onSubmit({
      title,
      projectType,
      location,
      geometry: geometry ?? undefined,
      image: image || undefined,
      notes: notes || undefined,
      // regular fields (empty for traffic/blockage)
      targetYear: isTraffic || isBlockage ? undefined : targetYear,
      cost:       isTraffic || isBlockage ? undefined : cost,
      // traffic fields (undefined for non-traffic)
      trafficPurpose:         isTraffic ? (trafficPurpose         || undefined) : undefined,
      trafficStartDate:       isTraffic ? (trafficStartDate       || undefined) : undefined,
      trafficClosureDate:     isTraffic ? (trafficClosureDate     || undefined) : undefined,
      locationName:           isTraffic ? (locationName.trim()    || undefined) : undefined,
      contacts:               isTraffic ? (contacts.trim()        || undefined) : undefined,
      trafficClosureDuration: isTraffic ? (trafficClosureDuration || undefined) : undefined,
      contractor:             isTraffic ? (contractor             || undefined) : undefined,
      department:             isTraffic ? (department.trim()        || undefined) : undefined,
      adminHead:              isTraffic ? (adminHead.trim()         || undefined) : undefined,
      arrangementStatus:      isTraffic ? (arrangementStatus.trim() || undefined) : undefined,
      managementCompany:      (isTraffic || isBlockage) ? (managementCompany || undefined) : undefined,
      // blockage fields (undefined for non-blockage)
      subProject:     isBlockage ? (subProject     || undefined) : undefined,
      initiator:      isBlockage ? (initiator || undefined) : isTraffic ? (trafficInitiator.trim() || undefined) : undefined,
      representative: isBlockage ? (representative || undefined) : undefined,
      blockageStatus: isBlockage ? (blockageStatus || undefined) : undefined,
    });
    onClose();
  };

  const inputCls  = (ring = 'focus:ring-green-500') =>
    `w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 ${ring}`;
  const selectCls = (ring = 'focus:ring-green-500') =>
    `w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 ${ring} bg-white`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" dir="rtl">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto relative shadow-2xl">
        <button onClick={onClose}
          className="absolute top-4 left-4 p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          <h2 className="text-2xl font-bold text-gray-800">{editing ? `עריכה: ${initial!.title}` : 'הוספת פרויקט חדש'}</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── סוג פרויקט ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סוג פרויקט <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {PROJECT_TYPES.map(pt => {
                const selected = projectType === pt.type;
                return (
                  <button key={pt.type} type="button" onClick={() => handleTypeChange(pt.type)}
                    className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 text-center text-xs font-medium transition-all
                      ${selected ? 'shadow-md' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:bg-gray-100'}`}
                    style={selected ? { borderColor: pt.color, background: pt.color + '18', color: pt.color } : {}}>
                    <span className="text-xl leading-none">{pt.icon}</span>
                    <span className="leading-tight text-[11px]">{pt.label}</span>
                    {selected && <span className="w-1.5 h-1.5 rounded-full" style={{ background: pt.color }} />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {PROJECT_TYPES.find(t => t.type === projectType)?.desc}
              {projectType === 'הקמת_מסילה' && ' · מצב שרטוט קו הופעל אוטומטית'}
            </p>
          </div>

          {/* ── שם הפרויקט / ההסדר ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isTraffic ? 'שם ההסדר' : isBlockage ? 'שם החסם' : 'שם הפרויקט'} <span className="text-red-500">*</span>
            </label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
              placeholder={isTraffic ? 'לדוגמה: הסדר תנועה צומת גהה' : isBlockage ? 'לדוגמה: מסילה מזרחית — גשר 444' : 'לדוגמה: הארכת מסילה לאשקלון'}
              className={inputCls()} />
          </div>

          {/* ── שדות לפי סוג ── */}
          {isTraffic ? (
            /* ======== הסדרי תנועה ======== */
            <>
              {/* מטרת ההסדר */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">מטרת ההסדר</label>
                <textarea value={trafficPurpose} onChange={e => setTrafficPurpose(e.target.value)}
                  rows={2} placeholder="לדוגמה: עבודות תשתית, הנחת כבלים, חפירה..."
                  className={`${inputCls()} resize-none`} />
              </div>

              {/* תאריכים + משך */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תאריך התחלה</label>
                  <input type="date" value={trafficStartDate} onChange={e => setTrafficStartDate(e.target.value)}
                    className={inputCls()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תאריך סיום</label>
                  <input type="date" value={trafficClosureDate} onChange={e => setTrafficClosureDate(e.target.value)}
                    className={inputCls(datesInvalid ? 'focus:ring-red-500' : undefined)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">משך סגירה משוער</label>
                  <input type="text" value={trafficClosureDuration} onChange={e => setTrafficClosureDuration(e.target.value)}
                    placeholder="לדוגמה: 3 ימים"
                    className={inputCls()} />
                </div>
              </div>
              {datesInvalid && <p className="text-xs text-red-600 -mt-2">תאריך הסיום מוקדם מתאריך ההתחלה</p>}
              {isTraffic && !trafficClosureDate && (
                <p className="text-xs text-yellow-700 -mt-2">בלי תאריך סיום ההסדר יסומן במפה בתג אזהרה צהוב</p>
              )}

              {/* מיקום + יזם ההסדר */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מיקום (תחנה או אתר)</label>
                  <input type="text" value={locationName} onChange={e => setLocationName(e.target.value)}
                    placeholder="לדוגמה: ירושלים - יצחק נבון"
                    className={inputCls()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">יזם ההסדר</label>
                  <input type="text" value={trafficInitiator} onChange={e => setTrafficInitiator(e.target.value)}
                    placeholder="לדוגמה: נת״י"
                    className={inputCls()} />
                </div>
              </div>

              {/* אגף + ראש מנהלת */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אגף</label>
                  <input type="text" value={department} onChange={e => setDepartment(e.target.value)}
                    className={inputCls()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ראש מנהלת</label>
                  <input type="text" value={adminHead} onChange={e => setAdminHead(e.target.value)}
                    className={inputCls()} />
                </div>
              </div>

              {/* חברת ניהול */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">חברת ניהול</label>
                <input type="text" value={managementCompany} onChange={e => setManagementCompany(e.target.value)}
                  placeholder="שם חברת הניהול"
                  className={inputCls()} />
              </div>

              {/* נציג / אנשי קשר */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">נציג / אנשי קשר</label>
                <textarea value={contacts} onChange={e => setContacts(e.target.value)}
                  rows={2} placeholder="שם, תפקיד, טלפון. איש קשר בכל שורה"
                  className={`${inputCls()} resize-none`} />
              </div>

              {/* סטטוס (ידני) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
                <input type="text" list="arrangement-status-options" value={arrangementStatus}
                  onChange={e => setArrangementStatus(e.target.value)} placeholder="בחר מהרשימה או הקלד"
                  className={inputCls()} />
                <datalist id="arrangement-status-options">
                  <option value="בתכנון" /><option value="בהליך אישור" /><option value="מאושר" />
                  <option value="בביצוע" /><option value="מושהה" /><option value="הסתיים" />
                </datalist>
                <p className="text-[11px] text-gray-400 mt-1">הצבע במפה נקבע אוטומטית לפי התאריכים. השדה הזה מתעד את מצב הטיפול בהסדר.</p>
              </div>
            </>
          ) : isBlockage ? (
            /* ======== חסמים ======== */
            <>
              {/* תת פרויקט */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תת פרויקט</label>
                <input type="text" value={subProject} onChange={e => setSubProject(e.target.value)}
                  placeholder="לדוגמה: גשר 444, קטע A"
                  className={inputCls()} />
              </div>

              {/* יזם + נציג */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">יזם</label>
                  <select value={initiator} onChange={e => setInitiator(e.target.value)} className={selectCls()}>
                    <option value="">-- בחר יזם --</option>
                    <CurrentOption value={initiator} known={['נת"י', 'רכבת ישראל', 'עיריה', 'מינהל']} />
                    <option>נת"י</option>
                    <option>רכבת ישראל</option>
                    <option>עיריה</option>
                    <option>מינהל</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">נציג</label>
                  <select value={representative} onChange={e => setRepresentative(e.target.value)} className={selectCls()}>
                    <option value="">-- בחר נציג --</option>
                    <CurrentOption value={representative} known={['ניסים חביב', 'אליאס איוב', 'גיל', 'גולן בליטי']} />
                    <option>ניסים חביב</option>
                    <option>אליאס איוב</option>
                    <option>גיל</option>
                    <option>גולן בליטי</option>
                  </select>
                </div>
              </div>

              {/* חברת ניהול + סטטוס */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">חברת ניהול</label>
                  <select value={managementCompany} onChange={e => setManagementCompany(e.target.value)} className={selectCls()}>
                    <option value="">-- בחר חברה --</option>
                    <CurrentOption value={managementCompany} known={['חפת', 'פרימוורה', 'חפת/פרימוורה', 'אפשטיין']} />
                    <option>חפת</option>
                    <option>פרימוורה</option>
                    <option>חפת/פרימוורה</option>
                    <option>אפשטיין</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
                  <select value={blockageStatus} onChange={e => setBlockageStatus(e.target.value)} className={selectCls()}>
                    <option value="">-- בחר סטטוס --</option>
                    <CurrentOption value={blockageStatus} known={['מסירות', 'ביצוע', 'תאום תכנון מפורט', 'תיאום תכנון']} />
                    <option>מסירות</option>
                    <option>ביצוע</option>
                    <option>תאום תכנון מפורט</option>
                    <option>תיאום תכנון</option>
                    <option>זומן לשימוע</option>
                    <option>בתכנון</option>
                    <option>השלמות</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            /* ======== פרויקט רגיל ======== */
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  שנת יעד <span className="text-red-500">*</span>
                </label>
                <input type="text" value={targetYear} onChange={e => setTargetYear(e.target.value)}
                  required={!isTraffic && !isBlockage} placeholder="2028"
                  className={inputCls()} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  עלות הפרויקט <span className="text-red-500">*</span>
                </label>
                <input type="text" value={cost} onChange={e => setCost(e.target.value)}
                  required={!isTraffic && !isBlockage} placeholder="₪ 500,000,000"
                  className={inputCls()} />
              </div>
            </div>
          )}

          {/* ── מיקום גאוגרפי ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              מיקום גאוגרפי {!isTraffic && <span className="text-red-500">*</span>}
              {projectType === 'הקמת_מסילה'   && <span className="mr-2 text-[11px] font-normal text-indigo-500">— שרטט את מסלול המסילה על המפה</span>}
              {projectType === 'הסדרי_תנועה'  && <span className="mr-2 text-[11px] font-normal text-red-500">— סמן את אזור ההסדר על המפה, או מלא "מיקום" והנקודה תמוקם לפי התחנה</span>}
              {projectType === 'שדרוג_תשתית'  && <span className="mr-2 text-[11px] font-normal text-amber-600">— סמן את מיקום החסם על המפה</span>}
            </label>
            <GeoPickerMap
              mode={drawMode}
              onModeChange={setDrawMode}
              geometry={geometry}
              onGeometryChange={setGeometry}
              required={!placedByName}
              touched={submitted && !placedByName}
            />
          </div>

          {/* ── תמונה ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1.5"><ImageIcon size={13} /> קישור לתמונה — אופציונלי</span>
            </label>
            <input type="url" value={image} onChange={e => setImage(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className={inputCls()} />
            {isUnsupportedImageUrl(image) && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>קישור Google Photos לא נתמך כתמונה ישירה. השתמש ב-Google Drive (שיתוף → כל מי שיש לו קישור) או בקישור ישיר לקובץ ‎.jpg/.png.</span>
              </div>
            )}
            {image && !isUnsupportedImageUrl(image) && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-100 h-32">
                <img src={toDirectImageUrl(image)} alt="תצוגה מקדימה" className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
              </div>
            )}
          </div>

          {/* ── הערות ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות — אופציונלי</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder={isTraffic ? 'הגבלות, חלופות, פרטים נוספים...' : 'מידע נוסף על הפרויקט...'}
              className={`${inputCls()} resize-none`} />
          </div>

          <div className="flex justify-start gap-3 pt-4 border-t border-gray-100">
            <button type="submit"
              className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
              {editing ? 'שמור שינויים' : isTraffic ? 'הוסף הסדר תנועה' : isBlockage ? 'הוסף חסם' : 'הוסף פרויקט'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
