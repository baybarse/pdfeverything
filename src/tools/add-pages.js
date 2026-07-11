/* ============================================================
   Add to PDF Tool
   Insert PDF pages, blank pages, or image pages into a PDF
   ============================================================ */
import { createDropzone } from '../components/file-dropzone.js';
import { createProgressBar } from '../components/progress-bar.js';
import { showToast } from '../components/toast.js';
import { loadPdfDoc, getPdfInfo } from '../utils/pdf-utils.js';
import { readFileAsArrayBuffer, downloadBytes } from '../utils/file-utils.js';
import { PDFDocument } from 'pdf-lib';

/**
 * Parse a page range string like "1-3, 5, 7-10" or "all" into sorted 0-based indices.
 * @param {string} rangeStr
 * @param {number} totalPages
 * @returns {number[]}
 */
function parsePageRange(rangeStr, totalPages) {
  const trimmed = rangeStr.trim().toLowerCase();
  if (!trimmed || trimmed === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

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
 * Build the insert-position controls (shared by all three tabs).
 * Returns { element, getInsertIndex(totalPages) }.
 */
function createPositionControls() {
  const wrapper = document.createElement('div');
  wrapper.className = 'input-group';

  const label = document.createElement('label');
  label.textContent = 'Insert position';
  wrapper.appendChild(label);

  const row = document.createElement('div');
  row.className = 'input-row';
  wrapper.appendChild(row);

  const selectGroup = document.createElement('div');
  selectGroup.className = 'input-group';
  row.appendChild(selectGroup);

  const select = document.createElement('select');
  select.innerHTML = `
    <option value="end">End</option>
    <option value="beginning">Beginning</option>
    <option value="after">After page N</option>
  `;
  selectGroup.appendChild(select);

  const numGroup = document.createElement('div');
  numGroup.className = 'input-group';
  numGroup.style.display = 'none';
  row.appendChild(numGroup);

  const numInput = document.createElement('input');
  numInput.type = 'number';
  numInput.min = '1';
  numInput.value = '1';
  numInput.placeholder = 'Page number';
  numGroup.appendChild(numInput);

  select.addEventListener('change', () => {
    numGroup.style.display = select.value === 'after' ? '' : 'none';
  });

  return {
    element: wrapper,
    /**
     * Return the 0-based insert index for pdf-lib insertPage.
     * @param {number} totalPages — current page count of the base PDF
     * @returns {number}
     */
    getInsertIndex(totalPages) {
      if (select.value === 'beginning') return 0;
      if (select.value === 'after') {
        const n = parseInt(numInput.value, 10);
        return isNaN(n) ? totalPages : Math.min(Math.max(n, 0), totalPages);
      }
      return totalPages; // 'end'
    },
  };
}

/**
 * Render the Add to PDF tool into the given container.
 * @param {HTMLElement} container
 */
export function render(container) {
  container.innerHTML = '';

  /* ── State ─────────────────────────────────────────── */
  let basePdfFile = null;
  let basePdfBuffer = null;
  let basePageCount = 0;

  /* ── Card wrapper ──────────────────────────────────── */
  const card = document.createElement('div');
  card.className = 'card';
  container.appendChild(card);

  /* ── Base PDF dropzone ─────────────────────────────── */
  const baseDropzone = createDropzone({
    accept: '.pdf',
    multiple: false,
    label: 'Drop your base PDF here',
    hint: 'or click to browse — this is the PDF you want to add pages to',
    onFiles: handleBaseFile,
  });
  card.appendChild(baseDropzone.element);

  /* ── Base PDF info ─────────────────────────────────── */
  const baseInfo = document.createElement('div');
  baseInfo.className = 'pdf-info';
  baseInfo.style.display = 'none';
  card.appendChild(baseInfo);

  /* ── Tabs ──────────────────────────────────────────── */
  const tabsContainer = document.createElement('div');
  tabsContainer.style.display = 'none';
  card.appendChild(tabsContainer);

  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabsContainer.appendChild(tabs);

  const tabNames = ['Add PDF Pages', 'Add Blank Pages', 'Add Images'];
  const tabBtns = tabNames.map((name, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (idx === 0 ? ' active' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => switchTab(idx));
    tabs.appendChild(btn);
    return btn;
  });

  // Tab panels
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
     TAB 0 — Add PDF Pages
     ══════════════════════════════════════════════════════ */
  buildPdfPagesTab(panels[0]);

  /* ══════════════════════════════════════════════════════
     TAB 1 — Add Blank Pages
     ══════════════════════════════════════════════════════ */
  buildBlankPagesTab(panels[1]);

  /* ══════════════════════════════════════════════════════
     TAB 2 — Add Images
     ══════════════════════════════════════════════════════ */
  buildImagesTab(panels[2]);

  /* ── Helpers ───────────────────────────────────────── */

  function createButton(text, cls, handler) {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = text;
    btn.addEventListener('click', handler);
    return btn;
  }

  /* ── Handle base PDF ───────────────────────────────── */

  async function handleBaseFile(files) {
    if (!files || files.length === 0) return;
    basePdfFile = files[0];

    if (!basePdfFile.name.toLowerCase().endsWith('.pdf')) {
      showToast('Please upload a valid PDF file.', 'error');
      return;
    }

    try {
      basePdfBuffer = await readFileAsArrayBuffer(basePdfFile);
      const info = await getPdfInfo(basePdfBuffer);
      basePageCount = info.pageCount;

      baseInfo.style.display = '';
      baseInfo.innerHTML = `
        <span class="chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          ${basePdfFile.name}
        </span>
        <span class="chip">${basePageCount} page${basePageCount !== 1 ? 's' : ''}</span>
      `;

      tabsContainer.style.display = '';
      showToast(`Base PDF loaded — ${basePageCount} page(s)`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Failed to load PDF: ${err.message}`, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════
     TAB 0 — Add PDF Pages (build)
     ══════════════════════════════════════════════════════ */
  function buildPdfPagesTab(panel) {
    let srcPdfBuffer = null;
    let srcPageCount = 0;

    /* Source PDF dropzone */
    const srcDropzone = createDropzone({
      accept: '.pdf',
      multiple: false,
      label: 'Drop source PDF here',
      hint: 'Pages from this PDF will be added to your base document',
      onFiles: handleSourceFile,
    });
    panel.appendChild(srcDropzone.element);

    /* Source info */
    const srcInfo = document.createElement('div');
    srcInfo.className = 'pdf-info';
    srcInfo.style.display = 'none';
    panel.appendChild(srcInfo);

    /* Page range */
    const rangeGroup = document.createElement('div');
    rangeGroup.className = 'input-group';
    rangeGroup.style.display = 'none';
    panel.appendChild(rangeGroup);

    const rangeLabel = document.createElement('label');
    rangeLabel.textContent = 'Page range to copy (e.g. 1-3, 5 or "all")';
    rangeGroup.appendChild(rangeLabel);

    const rangeInput = document.createElement('input');
    rangeInput.type = 'text';
    rangeInput.value = 'all';
    rangeInput.placeholder = 'all';
    rangeGroup.appendChild(rangeInput);

    /* Position */
    const posCtrl = createPositionControls();
    posCtrl.element.style.display = 'none';
    panel.appendChild(posCtrl.element);

    /* Process button */
    const btnProcess = createButton('Add PDF Pages', 'btn-primary', processPdfPages);
    btnProcess.style.display = 'none';
    btnProcess.style.marginTop = '12px';
    panel.appendChild(btnProcess);

    async function handleSourceFile(files) {
      if (!files || files.length === 0) return;
      const srcFile = files[0];

      if (!srcFile.name.toLowerCase().endsWith('.pdf')) {
        showToast('Please upload a valid PDF file.', 'error');
        return;
      }

      try {
        srcPdfBuffer = await readFileAsArrayBuffer(srcFile);
        const info = await getPdfInfo(srcPdfBuffer);
        srcPageCount = info.pageCount;

        srcInfo.style.display = '';
        srcInfo.innerHTML = `
          <span class="chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            ${srcFile.name}
          </span>
          <span class="chip">${srcPageCount} page${srcPageCount !== 1 ? 's' : ''}</span>
        `;

        rangeGroup.style.display = '';
        posCtrl.element.style.display = '';
        btnProcess.style.display = '';
      } catch (err) {
        console.error(err);
        showToast(`Failed to load source PDF: ${err.message}`, 'error');
      }
    }

    async function processPdfPages() {
      if (!basePdfBuffer) { showToast('Please upload a base PDF first.', 'error'); return; }
      if (!srcPdfBuffer) { showToast('Please upload a source PDF.', 'error'); return; }

      try {
        btnProcess.disabled = true;
        progress.show();
        progress.setProgress(10, 'Loading PDFs…');

        const baseDoc = await PDFDocument.load(basePdfBuffer, { ignoreEncryption: true });
        const srcDoc = await PDFDocument.load(srcPdfBuffer, { ignoreEncryption: true });

        const indices = parsePageRange(rangeInput.value, srcPageCount);
        if (indices.length === 0) {
          showToast('No valid pages in the specified range.', 'error');
          progress.hide();
          btnProcess.disabled = false;
          return;
        }

        progress.setProgress(30, 'Copying pages…');
        const copiedPages = await baseDoc.copyPages(srcDoc, indices);

        const insertIdx = posCtrl.getInsertIndex(baseDoc.getPageCount());

        for (let i = 0; i < copiedPages.length; i++) {
          const targetIdx = insertIdx + i;
          if (targetIdx >= baseDoc.getPageCount()) {
            baseDoc.addPage(copiedPages[i]);
          } else {
            baseDoc.insertPage(targetIdx, copiedPages[i]);
          }
          progress.setProgress(30 + Math.round((i / copiedPages.length) * 50), `Inserting page ${i + 1} / ${copiedPages.length}`);
        }

        progress.setProgress(90, 'Saving PDF…');
        const pdfBytes = await baseDoc.save();
        const baseName = basePdfFile.name.replace(/\.pdf$/i, '');
        downloadBytes(pdfBytes, `${baseName}_pages_added.pdf`);

        progress.setProgress(100, 'Done!');
        showToast(`Added ${copiedPages.length} page(s) successfully!`, 'success');
        setTimeout(() => progress.hide(), 800);
      } catch (err) {
        console.error(err);
        showToast(`Failed to add pages: ${err.message}`, 'error');
        progress.hide();
      } finally {
        btnProcess.disabled = false;
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     TAB 1 — Add Blank Pages (build)
     ══════════════════════════════════════════════════════ */
  function buildBlankPagesTab(panel) {
    /* Number of blank pages */
    const countGroup = document.createElement('div');
    countGroup.className = 'input-group';
    panel.appendChild(countGroup);

    const countLabel = document.createElement('label');
    countLabel.textContent = 'Number of blank pages';
    countGroup.appendChild(countLabel);

    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.min = '1';
    countInput.max = '100';
    countInput.value = '1';
    countGroup.appendChild(countInput);

    /* Page size */
    const sizeGroup = document.createElement('div');
    sizeGroup.className = 'input-group';
    panel.appendChild(sizeGroup);

    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Page size';
    sizeGroup.appendChild(sizeLabel);

    const sizeSelect = document.createElement('select');
    sizeSelect.innerHTML = `
      <option value="same">Same as document</option>
      <option value="a4">A4 (595 × 842)</option>
      <option value="letter">Letter (612 × 792)</option>
    `;
    sizeGroup.appendChild(sizeSelect);

    /* Position */
    const posCtrl = createPositionControls();
    panel.appendChild(posCtrl.element);

    /* Process button */
    const btnProcess = createButton('Add Blank Pages', 'btn-primary', processBlankPages);
    btnProcess.style.marginTop = '12px';
    panel.appendChild(btnProcess);

    async function processBlankPages() {
      if (!basePdfBuffer) { showToast('Please upload a base PDF first.', 'error'); return; }

      const count = parseInt(countInput.value, 10);
      if (isNaN(count) || count < 1) { showToast('Enter a valid number of pages.', 'error'); return; }

      try {
        btnProcess.disabled = true;
        progress.show();
        progress.setProgress(10, 'Loading PDF…');

        const baseDoc = await PDFDocument.load(basePdfBuffer, { ignoreEncryption: true });

        // Determine page dimensions
        let width, height;
        if (sizeSelect.value === 'a4') {
          width = 595; height = 842;
        } else if (sizeSelect.value === 'letter') {
          width = 612; height = 792;
        } else {
          // Same as first page of document
          const firstPage = baseDoc.getPage(0);
          const { width: pw, height: ph } = firstPage.getSize();
          width = pw; height = ph;
        }

        const insertIdx = posCtrl.getInsertIndex(baseDoc.getPageCount());

        progress.setProgress(30, 'Adding blank pages…');
        for (let i = 0; i < count; i++) {
          const targetIdx = insertIdx + i;
          if (targetIdx >= baseDoc.getPageCount()) {
            baseDoc.addPage([width, height]);
          } else {
            baseDoc.insertPage(targetIdx, [width, height]);
          }
          progress.setProgress(30 + Math.round(((i + 1) / count) * 50), `Adding page ${i + 1} / ${count}`);
        }

        progress.setProgress(90, 'Saving PDF…');
        const pdfBytes = await baseDoc.save();
        const baseName = basePdfFile.name.replace(/\.pdf$/i, '');
        downloadBytes(pdfBytes, `${baseName}_blank_added.pdf`);

        progress.setProgress(100, 'Done!');
        showToast(`Added ${count} blank page(s) successfully!`, 'success');
        setTimeout(() => progress.hide(), 800);
      } catch (err) {
        console.error(err);
        showToast(`Failed to add blank pages: ${err.message}`, 'error');
        progress.hide();
      } finally {
        btnProcess.disabled = false;
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     TAB 2 — Add Images (build)
     ══════════════════════════════════════════════════════ */
  function buildImagesTab(panel) {
    /* Image dropzone */
    const imgDropzone = createDropzone({
      accept: '.png,.jpg,.jpeg',
      multiple: true,
      label: 'Drop images here',
      hint: 'PNG or JPEG — each image becomes a full page',
    });
    panel.appendChild(imgDropzone.element);

    /* Position */
    const posCtrl = createPositionControls();
    posCtrl.element.style.marginTop = '12px';
    panel.appendChild(posCtrl.element);

    /* Process button */
    const btnProcess = createButton('Add Images as Pages', 'btn-primary', processImages);
    btnProcess.style.marginTop = '12px';
    panel.appendChild(btnProcess);

    async function processImages() {
      if (!basePdfBuffer) { showToast('Please upload a base PDF first.', 'error'); return; }

      const imageFiles = imgDropzone.getFiles();
      if (imageFiles.length === 0) { showToast('Please upload at least one image.', 'error'); return; }

      try {
        btnProcess.disabled = true;
        progress.show();
        progress.setProgress(10, 'Loading PDF…');

        const baseDoc = await PDFDocument.load(basePdfBuffer, { ignoreEncryption: true });
        const insertIdx = posCtrl.getInsertIndex(baseDoc.getPageCount());

        for (let i = 0; i < imageFiles.length; i++) {
          const imgFile = imageFiles[i];
          const imgBuffer = await readFileAsArrayBuffer(imgFile);
          const imgBytes = new Uint8Array(imgBuffer);

          // Determine image type and embed
          let embeddedImage;
          const name = imgFile.name.toLowerCase();
          if (name.endsWith('.png')) {
            embeddedImage = await baseDoc.embedPng(imgBytes);
          } else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
            embeddedImage = await baseDoc.embedJpg(imgBytes);
          } else {
            showToast(`Unsupported image format: ${imgFile.name}`, 'error');
            continue;
          }

          // Create a page sized to the image
          const imgDims = embeddedImage.scale(1);
          const targetIdx = insertIdx + i;

          let page;
          if (targetIdx >= baseDoc.getPageCount()) {
            page = baseDoc.addPage([imgDims.width, imgDims.height]);
          } else {
            page = baseDoc.insertPage(targetIdx, [imgDims.width, imgDims.height]);
          }

          page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: imgDims.width,
            height: imgDims.height,
          });

          progress.setProgress(10 + Math.round(((i + 1) / imageFiles.length) * 75),
            `Processing image ${i + 1} / ${imageFiles.length}`);
        }

        progress.setProgress(90, 'Saving PDF…');
        const pdfBytes = await baseDoc.save();
        const baseName = basePdfFile.name.replace(/\.pdf$/i, '');
        downloadBytes(pdfBytes, `${baseName}_images_added.pdf`);

        progress.setProgress(100, 'Done!');
        showToast(`Added ${imageFiles.length} image page(s) successfully!`, 'success');
        setTimeout(() => progress.hide(), 800);
      } catch (err) {
        console.error(err);
        showToast(`Failed to add images: ${err.message}`, 'error');
        progress.hide();
      } finally {
        btnProcess.disabled = false;
      }
    }
  }
}
