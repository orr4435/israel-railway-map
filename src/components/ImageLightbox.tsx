import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';

/** Full-screen image viewer. Rendered into <body> so it also works from inside a map popup. */
export function ImageLightbox({ src, title, onClose }: { src: string; title?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[20000] bg-black/85 flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <button onClick={onClose} title="סגור (Esc)"
        className="absolute top-4 left-4 p-2 rounded-full bg-white/15 hover:bg-white/30 text-white"><X size={22} /></button>
      <a href={src} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="פתח בטאב חדש"
        className="absolute top-4 left-16 p-2 rounded-full bg-white/15 hover:bg-white/30 text-white"><ExternalLink size={22} /></a>
      <figure className="max-w-full max-h-full flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
        <img src={src} alt={title ?? ''} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
        {title && <figcaption className="text-white text-sm font-medium text-center">{title}</figcaption>}
      </figure>
    </div>,
    document.body,
  );
}

/** Small clickable thumbnail that opens the lightbox. Hides itself when the image cannot load. */
export function ImageThumb({ src, title, onOpen, height = 110 }: { src: string; title?: string; onOpen: () => void; height?: number }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onOpen(); }} title="לחץ להגדלה"
      style={{ display: 'block', width: '100%', height, padding: 0, border: 'none', borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in', position: 'relative', background: '#f3f4f6' }}>
      <img src={src} alt={title ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={e => { ((e.currentTarget as HTMLImageElement).parentElement as HTMLElement).style.display = 'none'; }} />
      <span style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, padding: '1px 7px', borderRadius: 999 }}>
        🔍 הגדלה
      </span>
    </button>
  );
}
