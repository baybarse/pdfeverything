import { createDropzone } from '../components/file-dropzone.js';
import { createProgressBar } from '../components/progress-bar.js';
import { showToast } from '../components/toast.js';
import { loadPdfDoc, renderAllThumbnails } from '../utils/pdf-utils.js';
import { readFileAsArrayBuffer, downloadBytes, downloadZip } from '../utils/file-utils.js';
import { PDFDocument } from 'pdf-lib';

/**
 * Parse a page-range string like "1-3, 5, 7-10" into a Set of 0-based page indices.
 * @param {string} rangeStr
 * @param {number} totalPages
 * @returns {Set<number>}
 */
function parsePageRanges(rangeStr, totalPages) {
  const indices = new Set();
  const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = Math.max(1, parseInt(startStr, 10));
      const end = Math.min(totalPages, parseInt(endStr, 10));
      if (isNaN(start) || isNaN(end)) continue;
      for (let i = start; i <= end; i++) {
        indices.add(i - 1);
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        indices.add(page - 1);
      }
    }
  }
  return indices;
}

/**
 * Render the Split PDF tool into the given container.
 * @param {HTMLElement} container
 */
export function render(container) {
  container.innerHTML = '';

  /* ── State ─────────────────────────────────────────── */
  let pdfFile = null;
  let pdfDoc = null;       // pdf-lib PDFDocument (loaded)
  let totalPages = 0;
  const selectedPages = new Set(); // 0-based indices

  /* ── Card wrapper ──────────────────────────────────── */
  const card = document.createElement('div');
  card.className = 'card';
  container.appendChild(card);

  /* ── Dropzone ──────────────────────────────────────── */
  const dropzoneWrapper = document.createElement('div');
  card.appendChild(dropzoneWrapper);

  const dropzone = createDropzone({
    accept: '.pdf',
    multiple: false,
    label: 'Drop a PDF file here or click to browse',
    onFiles: handleFiles,
  });
  dropzoneWrapper.appendChild(dropzone.element);

  /* ── Progress bar ──────────────────────────────────── */
  const progress = createProgressBar();
  card.appendChild(progress.el);

  /* ── Thumbnails section (hidden initially) ─────────── */
  const thumbnailSection = document.createElement('div');
  thumbnailSection.style.display = 'none';
  card.appendChild(thumbnailSection);

  // Quick-action buttons
  const quickActions = document.createElement('div');
  quickActions.className = 'tool-actions';
  quickActions.style.flexWrap = 'wrap';
  quickActions.style.marginBottom = '12px';
  thumbnailSection.appendChild(quickActions);

  const btnSelectAll = createButton('Select All', 'btn-secondary', () => setSelection('all'));
  const btnDeselectAll = createButton('Deselect All', 'btn-secondary', () => setSelection('none'));
  const btnSelectOdd = createButton('Select Odd', 'btn-secondary', () => setSelection('odd'));
  const btnSelectEven = createButton('Select Even', 'btn-secondary', () => setSelection('even'));
  quickActions.append(btnSelectAll, btnDeselectAll, btnSelectOdd, btnSelectEven);

  // Page-range input
  const rangeGroup = document.createElement('div');
  rangeGroup.className = 'input-group';
  rangeGroup.style.marginBottom = '12px';
  thumbnailSection.appendChild(rangeGroup);

  const rangeLabel = document.createElement('label');
  rangeLabel.textContent = 'Page ranges (e.g. 1-3, 5, 7-10)';
  rangeGroup.appendChild(rangeLabel);

  const rangeRow = document.createElement('div');
  rangeRow.style.display = 'flex';
  rangeRow.style.gap = '8px';
  rangeGroup.appendChild(rangeRow);

  const rangeInput = document.createElement('input');
  rangeInput.type = 'text';
  rangeInput.placeholder = '1-3, 5, 7-10';
  rangeInput.style.flex = '1';
  rangeRow.appendChild(rangeInput);

  const btnApplyRange = createButton('Apply', 'btn-primary', () => {
    const parsed = parsePageRanges(rangeInput.value, totalPages);
    selectedPages.clear();
    parsed.forEach(i => selectedPages.add(i));
    refreshThumbnailSelection();
  });
  rangeRow.appendChild(btnApplyRange);

  // Thumbnail grid
  const thumbnailGrid = document.createElement('div');
  thumbnailGrid.className = 'thumbnail-grid';
  thumbnailSection.appendChild(thumbnailGrid);

  /* ── Options section ───────────────────────────────── */
  const optionsSection = document.createElement('div');
  optionsSection.className = 'tool-options';
  optionsSection.style.display = 'none';
  card.appendChild(optionsSection);

  const optionLabel = document.createElement('span');
  optionLabel.textContent = 'Split mode:';
  optionsSection.appendChild(optionLabel);

  const modeSelect = document.createElement('select');
  modeSelect.innerHTML = `
    <option value="separate">Each page as separate PDF</option>
    <option value="combine">Combine selected pages into one PDF</option>
  `;
  optionsSection.appendChild(modeSelect);

  /* ── Action buttons ────────────────────────────────── */
  const actionRow = document.createElement('div');
  actionRow.className = 'tool-actions';
  actionRow.style.display = 'none';
  card.appendChild(actionRow);

  const btnSplit = createButton('Split PDF', 'btn-primary', handleSplit);
  actionRow.appendChild(btnSplit);

  /* ── Helpers ───────────────────────────────────────── */

  function createButton(text, cls, handler) {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = text;
    btn.addEventListener('click', handler);
    return btn;
  }

  function setSelection(mode) {
    selectedPages.clear();
    for (let i = 0; i < totalPages; i++) {
      if (mode === 'all') selectedPages.add(i);
      else if (mode === 'odd' && (i + 1) % 2 !== 0) selectedPages.add(i);
      else if (mode === 'even' && (i + 1) % 2 === 0) selectedPages.add(i);
    }
    refreshThumbnailSelection();
  }

  function refreshThumbnailSelection() {
    const items = thumbnailGrid.querySelectorAll('.thumbnail-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', selectedPages.has(idx));
    });
    // Sync the range input with current selection
    rangeInput.value = buildRangeString();
  }

  function buildRangeString() {
    if (selectedPages.size === 0) return '';
    const sorted = [...selectedPages].sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0];
    let end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start + 1}` : `${start + 1}-${end + 1}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start + 1}` : `${start + 1}-${end + 1}`);
    return ranges.join(', ');
  }

  /* ── File handling ─────────────────────────────────── */

  async function handleFiles(files) {
    if (!files || files.length === 0) return;
    pdfFile = files[0];

    if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
      showToast('Please upload a valid PDF file.', 'error');
      return;
    }

    try {
      progress.show();
      progress.set(0, 'Loading PDF…');

      const arrayBuffer = await readFileAsArrayBuffer(pdfFile);

      progress.set(20, 'Parsing PDF…');
      pdfDoc = await loadPdfDoc(arrayBuffer);
      totalPages = pdfDoc.getPageCount();

      if (totalPages === 0) {
        showToast('The PDF has no pages.', 'error');
        progress.hide();
        return;
      }

      progress.set(40, `Rendering ${totalPages} thumbnails…`);

      // Render thumbnails
      thumbnailGrid.innerHTML = '';
      await renderAllThumbnails(arrayBuffer, thumbnailGrid, {
        onProgress: (current, total) => {
          const pct = 40 + Math.round((current / total) * 50);
          progress.set(pct, `Rendering thumbnail ${current} / ${total}`);
        },
      });

      // Attach click listeners to each thumbnail
      const items = thumbnailGrid.querySelectorAll('.thumbnail-item');
      items.forEach((item, idx) => {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
          if (selectedPages.has(idx)) {
            selectedPages.delete(idx);
          } else {
            selectedPages.add(idx);
          }
          refreshThumbnailSelection();
        });
      });

      // Select all by default
      setSelection('all');

      thumbnailSection.style.display = '';
      optionsSection.style.display = '';
      actionRow.style.display = '';
      dropzoneWrapper.style.display = 'none';

      progress.set(100, 'Ready');
      setTimeout(() => progress.hide(), 600);
      showToast(`Loaded "${pdfFile.name}" — ${totalPages} page(s)`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Failed to load PDF: ${err.message}`, 'error');
      progress.hide();
    }
  }

  /* ── Splitting logic ───────────────────────────────── */

  async function handleSplit() {
    if (selectedPages.size === 0) {
      showToast('No pages selected.', 'error');
      return;
    }

    const mode = modeSelect.value;
    const sortedIndices = [...selectedPages].sort((a, b) => a - b);
    const baseName = pdfFile.name.replace(/\.pdf$/i, '');

    try {
      btnSplit.disabled = true;
      progress.show();
      progress.set(0, 'Splitting…');

      const srcBuffer = await readFileAsArrayBuffer(pdfFile);

      if (mode === 'combine') {
        /* ── Combine selected pages into one PDF ──────── */
        const srcDoc = await PDFDocument.load(srcBuffer);
        const newDoc = await PDFDocument.create();
        const copiedPages = await newDoc.copyPages(srcDoc, sortedIndices);
        copiedPages.forEach(page => newDoc.addPage(page));

        progress.set(80, 'Saving PDF…');
        const pdfBytes = await newDoc.save();
        downloadBytes(pdfBytes, `${baseName}_selected.pdf`, 'application/pdf');

        progress.set(100, 'Done');
        showToast('Combined PDF downloaded!', 'success');
      } else {
        /* ── Each page as separate PDF ────────────────── */
        const files = [];
        const srcDoc = await PDFDocument.load(srcBuffer);

        for (let i = 0; i < sortedIndices.length; i++) {
          const pageIdx = sortedIndices[i];
          const singleDoc = await PDFDocument.create();
          const [copiedPage] = await singleDoc.copyPages(srcDoc, [pageIdx]);
          singleDoc.addPage(copiedPage);
          const bytes = await singleDoc.save();
          files.push({
            name: `${baseName}_page_${pageIdx + 1}.pdf`,
            data: bytes,
          });

          const pct = Math.round(((i + 1) / sortedIndices.length) * 90);
          progress.set(pct, `Processing page ${i + 1} / ${sortedIndices.length}`);
        }

        if (files.length === 1) {
          downloadBytes(files[0].data, files[0].name, 'application/pdf');
          showToast('PDF downloaded!', 'success');
        } else {
          progress.set(95, 'Creating ZIP…');
          await downloadZip(files, `${baseName}_split.zip`);
          showToast(`${files.length} PDFs downloaded as ZIP!`, 'success');
        }

        progress.set(100, 'Done');
      }

      setTimeout(() => progress.hide(), 800);
    } catch (err) {
      console.error(err);
      showToast(`Split failed: ${err.message}`, 'error');
      progress.hide();
    } finally {
      btnSplit.disabled = false;
    }
  }
}
