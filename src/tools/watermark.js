/* ============================================================
   Watermark Tool
   Add text or image watermarks to PDF pages
   ============================================================ */
import { createDropzone } from '../components/file-dropzone.js';
import { createProgressBar } from '../components/progress-bar.js';
import { showToast } from '../components/toast.js';
import { loadPdfDoc } from '../utils/pdf-utils.js';
import { readFileAsArrayBuffer, downloadBytes } from '../utils/file-utils.js';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

/**
 * Parse a hex color string (#RRGGBB) into { r, g, b } in the 0–1 range.
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0.39, g: 0.40, b: 0.95 }; // fallback indigo
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

/**
 * Parse a page-range spec — returns null for "all pages" or an array of 0-based indices.
 * @param {string} value
 * @param {number} totalPages
 * @returns {number[] | null}
 */
function parseApplyRange(value, totalPages) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === 'all') return null; // null = all pages

  const indices = new Set();
  const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = Math.max(1, parseInt(startStr, 10));
      const end = Math.min(totalPages, parseInt(endStr, 10));
      if (isNaN(start) || isNaN(end)) continue;
      for (let i = start; i <= end; i++) indices.add(i - 1);
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        indices.add(page - 1);
      }
    }
  }
  return [...indices].sort((a, b) => a - b);
}

/**
 * Render the Watermark tool into the given container.
 * @param {HTMLElement} container
 */
export function render(container) {
  container.innerHTML = '';

  /* ── State ─────────────────────────────────────────── */
  let pdfFile = null;
  let pdfBuffer = null;
  let totalPages = 0;

  /* ── Card wrapper ──────────────────────────────────── */
  const card = document.createElement('div');
  card.className = 'card';
  container.appendChild(card);

  /* ── PDF dropzone ──────────────────────────────────── */
  const dropzone = createDropzone({
    accept: '.pdf',
    multiple: false,
    label: 'Drop your PDF here',
    hint: 'or click to browse — the watermark will be applied to this file',
    onFiles: handlePdfFile,
  });
  card.appendChild(dropzone.element);

  /* ── PDF info ──────────────────────────────────────── */
  const pdfInfo = document.createElement('div');
  pdfInfo.className = 'pdf-info';
  pdfInfo.style.display = 'none';
  card.appendChild(pdfInfo);

  /* ── Tabs ──────────────────────────────────────────── */
  const tabsContainer = document.createElement('div');
  tabsContainer.style.display = 'none';
  card.appendChild(tabsContainer);

  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabsContainer.appendChild(tabs);

  const tabNames = ['Text Watermark', 'Image Watermark'];
  const tabBtns = tabNames.map((name, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (idx === 0 ? ' active' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => switchTab(idx));
    tabs.appendChild(btn);
    return btn;
  });

  const panels = tabNames.map(() => {
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.style.display = 'none';
    panel.style.marginTop = '16px';
    tabsContainer.appendChild(panel);
    return panel;
  });
  panels[0].style.display = '';

  function switchTab(idx) {
    tabBtns.forEach((b, i) => b.classList.toggle('active', i === idx));
    panels.forEach((p, i) => (p.style.display = i === idx ? '' : 'none'));
  }

  /* ── Progress ──────────────────────────────────────── */
  const progress = createProgressBar();
  card.appendChild(progress.element);

  /* ══════════════════════════════════════════════════════
     TAB 0 — Text Watermark
     ══════════════════════════════════════════════════════ */
  buildTextTab(panels[0]);

  /* ══════════════════════════════════════════════════════
     TAB 1 — Image Watermark
     ══════════════════════════════════════════════════════ */
  buildImageTab(panels[1]);

  /* ── Helpers ───────────────────────────────────────── */

  function createButton(text, cls, handler) {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = text;
    btn.addEventListener('click', handler);
    return btn;
  }

  /**
   * Build a range-input slider.
   * @returns {{ element: HTMLElement, input: HTMLInputElement, valueSpan: HTMLSpanElement }}
   */
  function createRangeSlider(labelText, min, max, value, step = 1) {
    const wrapper = document.createElement('div');
    wrapper.className = 'range-input';

    const lbl = document.createElement('label');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = labelText;
    const valSpan = document.createElement('span');
    valSpan.textContent = value;
    lbl.append(nameSpan, valSpan);
    wrapper.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    input.addEventListener('input', () => { valSpan.textContent = input.value; });
    wrapper.appendChild(input);

    return { element: wrapper, input, valueSpan: valSpan };
  }

  /* ── Handle PDF file ───────────────────────────────── */

  async function handlePdfFile(files) {
    if (!files || files.length === 0) return;
    pdfFile = files[0];

    if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
      showToast('Please upload a valid PDF file.', 'error');
      return;
    }

    try {
      pdfBuffer = await readFileAsArrayBuffer(pdfFile);
      const doc = await loadPdfDoc(pdfBuffer);
      totalPages = doc.getPageCount();

      pdfInfo.style.display = '';
      pdfInfo.innerHTML = `
        <span class="chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          ${pdfFile.name}
        </span>
        <span class="chip">${totalPages} page${totalPages !== 1 ? 's' : ''}</span>
      `;

      tabsContainer.style.display = '';
      showToast(`PDF loaded — ${totalPages} page(s)`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Failed to load PDF: ${err.message}`, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════
     TAB 0 — Text Watermark (build)
     ══════════════════════════════════════════════════════ */
  function buildTextTab(panel) {
    /* Text input */
    const textGroup = document.createElement('div');
    textGroup.className = 'input-group';
    panel.appendChild(textGroup);

    const textLabel = document.createElement('label');
    textLabel.textContent = 'Watermark text';
    textGroup.appendChild(textLabel);

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = 'CONFIDENTIAL';
    textInput.placeholder = 'Enter watermark text';
    textGroup.appendChild(textInput);

    /* Font size slider */
    const fontSize = createRangeSlider('Font size', 12, 120, 48);
    panel.appendChild(fontSize.element);

    /* Color picker */
    const colorGroup = document.createElement('div');
    colorGroup.className = 'input-group';
    panel.appendChild(colorGroup);

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color';
    colorGroup.appendChild(colorLabel);

    const colorPicker = document.createElement('div');
    colorPicker.className = 'color-picker-group';
    colorGroup.appendChild(colorPicker);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#6366f1';
    colorPicker.appendChild(colorInput);

    const colorHex = document.createElement('span');
    colorHex.textContent = '#6366f1';
    colorHex.style.fontSize = '0.85rem';
    colorHex.style.color = 'var(--text-secondary)';
    colorPicker.appendChild(colorHex);
    colorInput.addEventListener('input', () => { colorHex.textContent = colorInput.value; });

    /* Opacity slider */
    const opacity = createRangeSlider('Opacity', 0.05, 1, 0.3, 0.05);
    panel.appendChild(opacity.element);

    /* Rotation slider */
    const rotation = createRangeSlider('Rotation (degrees)', -90, 90, -45, 1);
    panel.appendChild(rotation.element);

    /* Position select */
    const posGroup = document.createElement('div');
    posGroup.className = 'input-group';
    panel.appendChild(posGroup);

    const posLabel = document.createElement('label');
    posLabel.textContent = 'Position';
    posGroup.appendChild(posLabel);

    const posSelect = document.createElement('select');
    posSelect.innerHTML = `
      <option value="center">Center</option>
      <option value="tiled">Tiled</option>
    `;
    posGroup.appendChild(posSelect);

    /* Apply to: pages */
    const applyGroup = document.createElement('div');
    applyGroup.className = 'input-group';
    panel.appendChild(applyGroup);

    const applyLabel = document.createElement('label');
    applyLabel.textContent = 'Apply to pages';
    applyGroup.appendChild(applyLabel);

    const applyInput = document.createElement('input');
    applyInput.type = 'text';
    applyInput.value = 'all';
    applyInput.placeholder = 'all — or e.g. 1-3, 5, 7';
    applyGroup.appendChild(applyInput);

    /* Apply button */
    const btnApply = createButton('Apply Text Watermark', 'btn-primary', applyTextWatermark);
    btnApply.style.marginTop = '12px';
    panel.appendChild(btnApply);

    async function applyTextWatermark() {
      if (!pdfBuffer) { showToast('Please upload a PDF first.', 'error'); return; }

      const text = textInput.value.trim();
      if (!text) { showToast('Please enter watermark text.', 'error'); return; }

      try {
        btnApply.disabled = true;
        progress.show();
        progress.setProgress(10, 'Loading PDF…');

        const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const size = parseFloat(fontSize.input.value);
        const opacityVal = parseFloat(opacity.input.value);
        const angle = parseFloat(rotation.input.value);
        const { r, g, b } = hexToRgb(colorInput.value);
        const position = posSelect.value;

        const pages = doc.getPages();
        const pageIndices = parseApplyRange(applyInput.value, pages.length);
        const targetPages = pageIndices === null
          ? pages.map((_, i) => i)
          : pageIndices;

        for (let pi = 0; pi < targetPages.length; pi++) {
          const idx = targetPages[pi];
          if (idx < 0 || idx >= pages.length) continue;
          const page = pages[idx];
          const { width, height } = page.getSize();

          if (position === 'tiled') {
            // Tiled watermark — draw text in a grid
            const textWidth = font.widthOfTextAtSize(text, size);
            const spacingX = textWidth + 80;
            const spacingY = size + 120;

            for (let y = -height; y < height * 2; y += spacingY) {
              for (let x = -width; x < width * 2; x += spacingX) {
                page.drawText(text, {
                  x,
                  y,
                  size,
                  font,
                  color: rgb(r, g, b),
                  opacity: opacityVal,
                  rotate: degrees(angle),
                });
              }
            }
          } else {
            // Center watermark
            const textWidth = font.widthOfTextAtSize(text, size);
            const textHeight = size;
            const x = (width - textWidth) / 2;
            const y = (height - textHeight) / 2;

            page.drawText(text, {
              x,
              y,
              size,
              font,
              color: rgb(r, g, b),
              opacity: opacityVal,
              rotate: degrees(angle),
            });
          }

          progress.setProgress(10 + Math.round(((pi + 1) / targetPages.length) * 75),
            `Watermarking page ${pi + 1} / ${targetPages.length}`);
        }

        progress.setProgress(90, 'Saving PDF…');
        const pdfBytes = await doc.save();
        const baseName = pdfFile.name.replace(/\.pdf$/i, '');
        downloadBytes(pdfBytes, `${baseName}_watermarked.pdf`);

        progress.setProgress(100, 'Done!');
        showToast('Text watermark applied successfully!', 'success');
        setTimeout(() => progress.hide(), 800);
      } catch (err) {
        console.error(err);
        showToast(`Watermark failed: ${err.message}`, 'error');
        progress.hide();
      } finally {
        btnApply.disabled = false;
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     TAB 1 — Image Watermark (build)
     ══════════════════════════════════════════════════════ */
  function buildImageTab(panel) {
    let watermarkBuffer = null;
    let watermarkFileName = '';

    /* Image dropzone */
    const imgDropzone = createDropzone({
      accept: '.png,.jpg,.jpeg',
      multiple: false,
      label: 'Drop watermark image here',
      hint: 'PNG or JPEG — will be overlaid on each page',
      onFiles: handleWatermarkImage,
    });
    panel.appendChild(imgDropzone.element);

    /* Scale slider */
    const scale = createRangeSlider('Scale (%)', 10, 200, 50, 1);
    panel.appendChild(scale.element);

    /* Opacity slider */
    const opacity = createRangeSlider('Opacity', 0.05, 1, 0.3, 0.05);
    panel.appendChild(opacity.element);

    /* Position select */
    const posGroup = document.createElement('div');
    posGroup.className = 'input-group';
    panel.appendChild(posGroup);

    const posLabel = document.createElement('label');
    posLabel.textContent = 'Position';
    posGroup.appendChild(posLabel);

    const posSelect = document.createElement('select');
    posSelect.innerHTML = `
      <option value="center">Center</option>
      <option value="top-left">Top-Left</option>
      <option value="top-right">Top-Right</option>
      <option value="bottom-left">Bottom-Left</option>
      <option value="bottom-right">Bottom-Right</option>
    `;
    posGroup.appendChild(posSelect);

    /* Apply button */
    const btnApply = createButton('Apply Image Watermark', 'btn-primary', applyImageWatermark);
    btnApply.style.marginTop = '12px';
    panel.appendChild(btnApply);

    async function handleWatermarkImage(files) {
      if (!files || files.length === 0) return;
      const file = files[0];
      watermarkFileName = file.name.toLowerCase();
      watermarkBuffer = await readFileAsArrayBuffer(file);
    }

    async function applyImageWatermark() {
      if (!pdfBuffer) { showToast('Please upload a PDF first.', 'error'); return; }
      if (!watermarkBuffer) { showToast('Please upload a watermark image.', 'error'); return; }

      try {
        btnApply.disabled = true;
        progress.show();
        progress.setProgress(10, 'Loading PDF…');

        const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
        const imgBytes = new Uint8Array(watermarkBuffer);

        // Embed watermark image
        let embeddedImage;
        if (watermarkFileName.endsWith('.png')) {
          embeddedImage = await doc.embedPng(imgBytes);
        } else if (watermarkFileName.endsWith('.jpg') || watermarkFileName.endsWith('.jpeg')) {
          embeddedImage = await doc.embedJpg(imgBytes);
        } else {
          showToast('Unsupported image format. Use PNG or JPEG.', 'error');
          progress.hide();
          btnApply.disabled = false;
          return;
        }

        const scaleVal = parseFloat(scale.input.value) / 100;
        const opacityVal = parseFloat(opacity.input.value);
        const position = posSelect.value;

        const imgDims = embeddedImage.scale(scaleVal);
        const pages = doc.getPages();

        for (let pi = 0; pi < pages.length; pi++) {
          const page = pages[pi];
          const { width, height } = page.getSize();

          // Calculate position
          let x, y;
          const margin = 20;

          switch (position) {
            case 'top-left':
              x = margin;
              y = height - imgDims.height - margin;
              break;
            case 'top-right':
              x = width - imgDims.width - margin;
              y = height - imgDims.height - margin;
              break;
            case 'bottom-left':
              x = margin;
              y = margin;
              break;
            case 'bottom-right':
              x = width - imgDims.width - margin;
              y = margin;
              break;
            case 'center':
            default:
              x = (width - imgDims.width) / 2;
              y = (height - imgDims.height) / 2;
              break;
          }

          page.drawImage(embeddedImage, {
            x,
            y,
            width: imgDims.width,
            height: imgDims.height,
            opacity: opacityVal,
          });

          progress.setProgress(10 + Math.round(((pi + 1) / pages.length) * 75),
            `Watermarking page ${pi + 1} / ${pages.length}`);
        }

        progress.setProgress(90, 'Saving PDF…');
        const pdfBytes = await doc.save();
        const baseName = pdfFile.name.replace(/\.pdf$/i, '');
        downloadBytes(pdfBytes, `${baseName}_watermarked.pdf`);

        progress.setProgress(100, 'Done!');
        showToast('Image watermark applied successfully!', 'success');
        setTimeout(() => progress.hide(), 800);
      } catch (err) {
        console.error(err);
        showToast(`Watermark failed: ${err.message}`, 'error');
        progress.hide();
      } finally {
        btnApply.disabled = false;
      }
    }
  }
}
