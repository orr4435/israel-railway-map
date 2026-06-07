import React, { useState } from 'react';
import { StoryPoint, GeoGeometry, locationFromGeometry, STATUS_COLORS } from '../types';
import { X, Image as ImageIcon } from 'lucide-react';
import { GeoPickerMap } from './GeoPickerMap';

interface AddStationFormProps {
  onSubmit: (station: Omit<StoryPoint, 'id'>) => void;
  onClose: () => void;
}

type DrawMode = 'point' | 'polyline';

export function AddStationForm({ onSubmit, onClose }: AddStationFormProps) {
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [status,      setStatus]      = useState('נוסעים');
  const [image,       setImage]       = useState('');
  const [linkUrl,     setLinkUrl]     = useState('');
  const [linkLabel,   setLinkLabel]   = useState('');
  const [geometry,    setGeometry]    = useState<GeoGeometry | null>(null);
  const [drawMode,    setDrawMode]    = useState<DrawMode>('point');
  const [submitted,   setSubmitted]   = useState(false);

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
      description,
      status,
      location,
      geometry: geometry!,
      image:    image    || undefined,
      link:     linkUrl  ? { url: linkUrl, label: linkLabel || linkUrl } : undefined,
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
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
          <h2 className="text-2xl font-bold text-gray-800">הוספת תחנה חדשה</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── שם + סטטוס ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                שם התחנה <span className="text-red-500">*</span>
              </label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
                placeholder="לדוגמה: תל אביב מרכז"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {Object.entries(STATUS_COLORS).map(([key, st]) => (
                  <option key={key} value={key}>{st.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── תיאור ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="תיאור קצר של התחנה"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* ── מיקום גאוגרפי ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              מיקום גאוגרפי <span className="text-red-500">*</span>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {image && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-100 h-32">
                <img src={image} alt="תצוגה מקדימה" className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
              </div>
            )}
          </div>

          {/* ── קישור ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">כתובת קישור — אופציונלי</label>
              <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://www.rail.co.il"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תווית קישור — אופציונלי</label>
              <input type="text" value={linkLabel} onChange={e => setLinkLabel(e.target.value)}
                placeholder="לאתר הרכבת"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex justify-start gap-3 pt-4 border-t border-gray-100">
            <button type="submit"
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
              הוסף תחנה
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
