import React, { useState } from 'react';
import { Project, PROJECT_TYPES, ProjectType, GeoGeometry, locationFromGeometry } from '../types';
import { X, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { GeoPickerMap } from './GeoPickerMap';
import { toDirectImageUrl, isUnsupportedImageUrl } from '../lib/image';

interface AddProjectFormProps {
  onSubmit: (project: Omit<Project, 'id'>) => void;
  onClose: () => void;
}

type DrawMode = 'point' | 'polyline';

const IS_TRAFFIC = (t: ProjectType) => t === 'הסדרי_תנועה';

export function AddProjectForm({ onSubmit, onClose }: AddProjectFormProps) {
  const [projectType, setProjectType] = useState<ProjectType>('אחר');

  // common fields
  const [title,     setTitle]     = useState('');
  const [image,     setImage]     = useState('');
  const [notes,     setNotes]     = useState('');
  const [geometry,  setGeometry]  = useState<GeoGeometry | null>(null);
  const [drawMode,  setDrawMode]  = useState<DrawMode>('point');
  const [submitted, setSubmitted] = useState(false);

  // regular project fields
  const [targetYear, setTargetYear] = useState('');
  const [cost,       setCost]       = useState('');

  // traffic-arrangement fields
  const [trafficPurpose,         setTrafficPurpose]         = useState('');
  const [trafficClosureDate,     setTrafficClosureDate]     = useState('');
  const [trafficClosureDuration, setTrafficClosureDuration] = useState('');
  const [contractor,             setContractor]             = useState('');
  const [managementCompany,      setManagementCompany]      = useState('');

  const isTraffic = IS_TRAFFIC(projectType);

  const handleTypeChange = (t: ProjectType) => {
    setProjectType(t);
    if (t === 'הקמת_מסילה') setDrawMode('polyline');
    else setDrawMode('point');
    setGeometry(null);
  };

  const validate = () => {
    if (!geometry) return false;
    if (geometry.type === 'LineString' && geometry.coordinates.length < 2) return false;
    if (!isTraffic && (!targetYear.trim() || !cost.trim())) return false;
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!validate()) return;

    const location = locationFromGeometry(geometry!);
    onSubmit({
      title,
      projectType,
      location,
      geometry: geometry!,
      image: image || undefined,
      notes: notes || undefined,
      // regular fields (empty for traffic)
      targetYear: isTraffic ? undefined : targetYear,
      cost:       isTraffic ? undefined : cost,
      // traffic fields (undefined for non-traffic)
      trafficPurpose:         isTraffic ? (trafficPurpose         || undefined) : undefined,
      trafficClosureDate:     isTraffic ? (trafficClosureDate     || undefined) : undefined,
      trafficClosureDuration: isTraffic ? (trafficClosureDuration || undefined) : undefined,
      contractor:             isTraffic ? (contractor             || undefined) : undefined,
      managementCompany:      isTraffic ? (managementCompany      || undefined) : undefined,
    });
    onClose();
  };

  const inputCls = (ring = 'focus:ring-green-500') =>
    `w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 ${ring}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" dir="rtl">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto relative shadow-2xl">
        <button onClick={onClose}
          className="absolute top-4 left-4 p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          <h2 className="text-2xl font-bold text-gray-800">הוספת פרויקט חדש</h2>
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
              {isTraffic ? 'שם ההסדר' : 'שם הפרויקט'} <span className="text-red-500">*</span>
            </label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
              placeholder={isTraffic ? 'לדוגמה: הסדר תנועה צומת גהה' : 'לדוגמה: הארכת מסילה לאשקלון'}
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

              {/* מועד + משך סגירה */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מועד סגירה משוער</label>
                  <input type="text" value={trafficClosureDate} onChange={e => setTrafficClosureDate(e.target.value)}
                    placeholder="לדוגמה: 15/07/2026"
                    className={inputCls()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">משך סגירה משוער</label>
                  <input type="text" value={trafficClosureDuration} onChange={e => setTrafficClosureDuration(e.target.value)}
                    placeholder="לדוגמה: 3 ימים, שבועיים"
                    className={inputCls()} />
                </div>
              </div>

              {/* קבלן + חברת ניהול */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">קבלן</label>
                  <input type="text" value={contractor} onChange={e => setContractor(e.target.value)}
                    placeholder="שם חברת הקבלן"
                    className={inputCls()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">חברת ניהול</label>
                  <input type="text" value={managementCompany} onChange={e => setManagementCompany(e.target.value)}
                    placeholder="שם חברת הניהול"
                    className={inputCls()} />
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
                  required={!isTraffic} placeholder="2028"
                  className={inputCls()} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  עלות הפרויקט <span className="text-red-500">*</span>
                </label>
                <input type="text" value={cost} onChange={e => setCost(e.target.value)}
                  required={!isTraffic} placeholder="₪ 500,000,000"
                  className={inputCls()} />
              </div>
            </div>
          )}

          {/* ── מיקום גאוגרפי ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              מיקום גאוגרפי <span className="text-red-500">*</span>
              {projectType === 'הקמת_מסילה'    && <span className="mr-2 text-[11px] font-normal text-indigo-500">— שרטט את מסלול המסילה על המפה</span>}
              {projectType === 'הסדרי_תנועה'   && <span className="mr-2 text-[11px] font-normal text-red-500">— סמן את אזור ההסדר על המפה</span>}
            </label>
            <GeoPickerMap
              mode={drawMode}
              onModeChange={setDrawMode}
              geometry={geometry}
              onGeometryChange={setGeometry}
              required
              touched={submitted}
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
              {isTraffic ? 'הוסף הסדר תנועה' : 'הוסף פרויקט'}
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
