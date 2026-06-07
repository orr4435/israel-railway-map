import React, { useState } from 'react';
import { Project, PROJECT_TYPES, ProjectType, GeoGeometry, locationFromGeometry } from '../types';
import { X, Image as ImageIcon } from 'lucide-react';
import { GeoPickerMap } from './GeoPickerMap';

interface AddProjectFormProps {
  onSubmit: (project: Omit<Project, 'id'>) => void;
  onClose: () => void;
}

type DrawMode = 'point' | 'polyline';

export function AddProjectForm({ onSubmit, onClose }: AddProjectFormProps) {
  const [title,       setTitle]       = useState('');
  const [targetYear,  setTargetYear]  = useState('');
  const [cost,        setCost]        = useState('');
  const [image,       setImage]       = useState('');
  const [notes,       setNotes]       = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('אחר');
  const [geometry,    setGeometry]    = useState<GeoGeometry | null>(null);
  const [drawMode,    setDrawMode]    = useState<DrawMode>('point');
  const [submitted,   setSubmitted]   = useState(false);

  // For rail-construction projects, default to polyline mode automatically
  const handleTypeChange = (t: ProjectType) => {
    setProjectType(t);
    if (t === 'הקמת_מסילה') setDrawMode('polyline');
    else setDrawMode('point');
    setGeometry(null);
  };

  const validate = () => {
    if (!geometry) return false;
    if (geometry.type === 'LineString' && geometry.coordinates.length < 2) return false;
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!validate()) return;

    const location = locationFromGeometry(geometry!);
    onSubmit({
      title,
      targetYear,
      cost,
      location,
      geometry: geometry!,
      image:       image || undefined,
      notes:       notes || undefined,
      projectType,
    });
    onClose();
  };

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

          {/* ── שם הפרויקט ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              שם הפרויקט <span className="text-red-500">*</span>
            </label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
              placeholder="לדוגמה: הארכת מסילה לאשקלון"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {/* ── שנת יעד + עלות ── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                שנת יעד <span className="text-red-500">*</span>
              </label>
              <input type="text" value={targetYear} onChange={e => setTargetYear(e.target.value)} required
                placeholder="2028"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                עלות הפרויקט <span className="text-red-500">*</span>
              </label>
              <input type="text" value={cost} onChange={e => setCost(e.target.value)} required
                placeholder="₪ 500,000,000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          {/* ── מיקום גאוגרפי ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              מיקום גאוגרפי <span className="text-red-500">*</span>
              {projectType === 'הקמת_מסילה' && (
                <span className="mr-2 text-[11px] font-normal text-indigo-500">— שרטט את מסלול המסילה על המפה</span>
              )}
              {projectType === 'הסדרי_תנועה' && (
                <span className="mr-2 text-[11px] font-normal text-red-500">— סמן את אזור הסדר התנועה</span>
              )}
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
              placeholder="https://example.com/project.jpg"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
            {image && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-100 h-32">
                <img src={image} alt="תצוגה מקדימה" className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
              </div>
            )}
          </div>

          {/* ── הערות ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות — אופציונלי</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="מידע נוסף על הפרויקט..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
          </div>

          <div className="flex justify-start gap-3 pt-4 border-t border-gray-100">
            <button type="submit"
              className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
              הוסף פרויקט
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
