/* ============================================================
   File Utilities — download, read, zip helpers
   ============================================================ */
import JSZip from 'jszip';

/**
 * Read a File object as ArrayBuffer
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read a File object as Data URL
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Trigger browser download for a Blob, string, or Uint8Array
 * @param {Blob|string|Uint8Array} data
 * @param {string} filename
 * @param {string} [mimeType]
 */
export function downloadBlob(data, filename, mimeType) {
  const blob = data instanceof Blob
    ? data
    : new Blob([data], { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download a Uint8Array as a file
 * @param {Uint8Array|Blob} data
 * @param {string} filename
 * @param {string} [mimeType='application/pdf']
 */
export function downloadBytes(data, filename, mimeType = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Create and download a ZIP containing multiple files
 * @param {Array<{name: string, data?: Uint8Array|Blob|ArrayBuffer, blob?: Blob}>} files
 * @param {string} [zipName='files.zip']
 */
export async function downloadZip(files, zipName = 'files.zip') {
  const zip = new JSZip();
  files.forEach(f => zip.file(f.name, f.data ?? f.blob));
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, zipName);
}

/**
 * Format bytes to human readable string
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Canvas to Blob helper
 * @param {HTMLCanvasElement} canvas
 * @param {string} [type='image/png']
 * @param {number} [quality=0.92]
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
  return new Promise((resolve) => {
    canvas.toBlob(blob => resolve(blob), type, quality);
  });
}
