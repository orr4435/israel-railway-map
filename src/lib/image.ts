// ── Image URL normalizer ──────────────────────────────────────────────────────
// Users often paste *share/viewer* links instead of *direct* image URLs.
// An <img src> needs a direct image. This converts the common Google cases.

/**
 * Converts share/viewer links into direct, <img>-loadable URLs where possible.
 * - Google Drive  → https://lh3.googleusercontent.com/d/{id}  (direct, no-CORS, reliable)
 * - Google Photos (photos.app.goo.gl) → returned as-is; cannot be converted to a
 *   direct image, so it will fail to load (caller should hide on error).
 */
export function toDirectImageUrl(url?: string): string {
  if (!url) return '';
  const u = url.trim();
  if (!u) return '';

  // Google Drive: /file/d/{ID}/view  |  ?id={ID}  |  /d/{ID}
  const driveId =
    u.match(/drive\.google\.com\/file\/d\/([\w-]+)/)?.[1] ??
    u.match(/[?&]id=([\w-]+)/)?.[1] ??
    (u.includes('drive.google.com') ? u.match(/\/d\/([\w-]+)/)?.[1] : undefined);
  if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}`;

  return u;
}

/** True for links we know cannot render as a direct image (e.g. Google Photos share). */
export function isUnsupportedImageUrl(url?: string): boolean {
  if (!url) return false;
  return /photos\.app\.goo\.gl|photos\.google\.com/.test(url);
}
