/* ============================================================
   PDF Utilities — shared helpers for pdf-lib & pdfjs-dist
   ============================================================ */
import { PDFDocument } from 'pdf-lib';

let pdfjsLib = null;
const pdfCache = new WeakMap();

/**
 * Get or lazily initialize pdfjs-dist
 */
export async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
  return pdfjsLib;
}

/**
 * Load a PDF with pdf-lib (for editing/modifying)
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<PDFDocument>}
 */
export async function loadPdfDoc(arrayBuffer) {
  return PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
}

/**
 * Create a new empty PDF document
 * @returns {Promise<PDFDocument>}
 */
export async function createPdfDoc() {
  return PDFDocument.create();
}

/**
 * Load a PDF with PDF.js (for rendering/reading text)
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {Promise<PDFDocumentProxy>}
 */
export async function loadPdfJs(data) {
  const pdfjs = await getPdfJs();
  // Copy the buffer to prevent pdf.js worker from detaching the original arrayBuffer
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  pdfCache.set(pdf, bytes);
  return pdf;
}

/**
 * Get basic info from a PDF
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{pageCount: number, title: string, author: string}>}
 */
export async function getPdfInfo(arrayBuffer) {
  const pdf = await loadPdfJs(arrayBuffer);
  const metadata = await pdf.getMetadata().catch(() => ({}));
  const info = metadata?.info || {};
  return {
    pageCount: pdf.numPages,
    title: info.Title || '',
    author: info.Author || '',
  };
}

/**
 * Extract all text from a PDF
 * @param {ArrayBuffer} arrayBuffer
 * @param {Function} [onProgress] — called with (pageNum, totalPages)
 * @returns {Promise<{pages: Array<{pageNum: number, text: string}>, fullText: string}>}
 */
export async function extractAllText(arrayBuffer, onProgress) {
  const pdf = await loadPdfJs(arrayBuffer);
  const pages = [];
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    pages.push({ pageNum: i, text });
    fullText += text + '\n\n';
    if (onProgress) onProgress(i, pdf.numPages);
  }

  return { pages, fullText: fullText.trim() };
}

/**
 * Render a PDF page to a canvas.
 * Supports:
 *   renderPageToCanvas(arrayBuffer, pageNum, scale)
 *   renderPageToCanvas(pdfDoc, pageNum, scale)
 *   renderPageToCanvas(pdfDoc, pageNum, canvas, scale)
 *
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderPageToCanvas(source, pageNum, arg3, arg4) {
  let pdf;
  let scale = 1.5;
  let canvas = null;

  if (source && typeof source.getPage === 'function') {
    pdf = source;
    if (arg3 instanceof HTMLCanvasElement) {
      canvas = arg3;
      scale = arg4 ?? 1.5;
    } else {
      scale = arg3 ?? 1.5;
    }
  } else {
    pdf = await loadPdfJs(source);
    scale = arg3 ?? 1.5;
  }

  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  if (!canvas) {
    canvas = document.createElement('canvas');
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * Render all pages as thumbnail canvases, or into a DOM grid.
 * Supports:
 *   renderAllThumbnails(arrayBuffer, scale?, onProgress?)
 *   renderAllThumbnails(arrayBuffer, container, { onProgress, scale })
 *
 * @returns {Promise<HTMLCanvasElement[]>}
 */
export async function renderAllThumbnails(arrayBuffer, containerOrScale = 0.5, optionsOrProgress) {
  let container = null;
  let scale = 0.5;
  let onProgress = null;

  if (containerOrScale instanceof HTMLElement) {
    container = containerOrScale;
    const options = optionsOrProgress || {};
    scale = options.scale ?? 0.5;
    onProgress = options.onProgress ?? null;
  } else {
    scale = containerOrScale ?? 0.5;
    onProgress = typeof optionsOrProgress === 'function' ? optionsOrProgress : null;
  }

  const pdf = await loadPdfJs(arrayBuffer);
  const canvases = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const canvas = await renderPageToCanvas(pdf, i, scale);
    canvases.push(canvas);

    if (container) {
      const item = document.createElement('div');
      item.className = 'thumbnail-item';
      item.dataset.page = String(i - 1);
      item.appendChild(canvas);

      const pageNum = document.createElement('span');
      pageNum.className = 'page-num';
      pageNum.textContent = String(i);
      item.appendChild(pageNum);

      const check = document.createElement('div');
      check.className = 'select-check';
      check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>';
      item.appendChild(check);

      container.appendChild(item);
    }

    if (onProgress) onProgress(i, pdf.numPages);
  }

  return canvases;
}

/**
 * Extract embedded images from a PDF page using operator list.
 * @param {PDFDocumentProxy} pdf
 * @param {number} pageNum
 * @returns {Promise<Array<{name: string, blob: Blob, width: number, height: number}>>}
 */
export async function extractPageImages(pdf, pageNum) {
  const page = await pdf.getPage(pageNum);
  const ops = await page.getOperatorList();
  const pdfjs = await getPdfJs();
  const images = [];
  let imageIndex = 0;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const isImageOp = 
      ops.fnArray[i] === pdfjs.OPS.paintImageXObject || 
      ops.fnArray[i] === pdfjs.OPS.paintJpegXObject ||
      ops.fnArray[i] === pdfjs.OPS.paintImageMaskXObject;
      
    if (!isImageOp) continue;

    const imageName = ops.argsArray[i][0];
    try {
      const imgData = await new Promise((resolve, reject) => {
        page.objs.get(imageName, resolve, reject);
      });

      if (!imgData?.data) continue;

      const canvas = document.createElement('canvas');
      canvas.width = imgData.width;
      canvas.height = imgData.height;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(imgData.width, imgData.height);
      imageData.data.set(imgData.data);
      ctx.putImageData(imageData, 0, 0);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      images.push({
        name: `page-${pageNum}-image-${++imageIndex}.png`,
        blob,
        width: imgData.width,
        height: imgData.height,
      });
    } catch {
      // Skip images that cannot be decoded
    }
  }

  return images;
}
