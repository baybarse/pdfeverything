import { createDropzone } from '../components/file-dropzone.js';
import { createProgressBar } from '../components/progress-bar.js';
import { showToast } from '../components/toast.js';
import { loadPdfDoc, getPdfInfo } from '../utils/pdf-utils.js';
import { readFileAsArrayBuffer, downloadBytes } from '../utils/file-utils.js';
import { PDFDocument } from 'pdf-lib';

/**
 * Format a file size in bytes to a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Render the Merge PDFs tool into the given container.
 * @param {HTMLElement} container
 */
export function render(container) {
  container.innerHTML = '';

  /* ── State ─────────────────────────────────────────── */
  /** @type {{ file: File, pageCount: number, id: string }[]} */
  let pdfEntries = [];

  /* ── Card wrapper ──────────────────────────────────── */
  const card = document.createElement('div');
  card.className = 'card';
  container.appendChild(card);

  /* ── Dropzone ──────────────────────────────────────── */
  const dropzoneWrapper = document.createElement('div');
  card.appendChild(dropzoneWrapper);

  const dropzone = createDropzone({
    accept: '.pdf',
    multiple: true,
    label: 'Drop PDF files here or click to browse',
    onFiles: handleFiles,
  });
  dropzoneWrapper.appendChild(dropzone.element);

  /* ── Progress bar ──────────────────────────────────── */
  const progress = createProgressBar();
  card.appendChild(progress.el);

  /* ── File list section (hidden initially) ──────────── */
  const listSection = document.createElement('div');
  listSection.style.display = 'none';
  card.appendChild(listSection);

  const fileList = document.createElement('div');
  fileList.className = 'file-list';
  listSection.appendChild(fileList);

  /* ── Secondary action: Add More Files ──────────────── */
  const addMoreRow = document.createElement('div');
  addMoreRow.className = 'tool-actions';
  addMoreRow.style.marginTop = '8px';
  listSection.appendChild(addMoreRow);

  const btnAddMore = document.createElement('button');
  btnAddMore.className = 'btn-secondary';
  btnAddMore.textContent = 'Add More Files';
  btnAddMore.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.multiple = true;
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        handleFiles([...input.files]);
      }
    });
    input.click();
  });
  addMoreRow.appendChild(btnAddMore);

  /* ── Primary action: Merge button ──────────────────── */
  const actionRow = document.createElement('div');
  actionRow.className = 'tool-actions';
  actionRow.style.display = 'none';
  card.appendChild(actionRow);

  const btnMerge = document.createElement('button');
  btnMerge.className = 'btn-primary';
  btnMerge.textContent = 'Merge PDFs';
  btnMerge.addEventListener('click', handleMerge);
  actionRow.appendChild(btnMerge);

  /* ── Drag-and-drop reorder state ───────────────────── */
  let draggedItem = null;
  let draggedIdx = -1;

  /* ── File handling ─────────────────────────────────── */

  async function handleFiles(files) {
    if (!files || files.length === 0) return;

    try {
      progress.show();
      let processed = 0;

      for (const file of files) {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
          showToast(`"${file.name}" is not a PDF — skipped.`, 'error');
          continue;
        }

        progress.set(
          Math.round((processed / files.length) * 100),
          `Reading "${file.name}"…`
        );

        const arrayBuffer = await readFileAsArrayBuffer(file);
        const doc = await loadPdfDoc(arrayBuffer);
        const pageCount = doc.getPageCount();

        pdfEntries.push({
          file,
          pageCount,
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        });

        processed++;
      }

      progress.set(100, 'Files loaded');
      setTimeout(() => progress.hide(), 500);

      renderFileList();

      listSection.style.display = '';
      actionRow.style.display = '';

      if (pdfEntries.length >= 1) {
        dropzoneWrapper.style.display = 'none';
      }

      showToast(`${processed} file(s) added.`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Error loading files: ${err.message}`, 'error');
      progress.hide();
    }
  }

  /* ── Render the file list ──────────────────────────── */

  function renderFileList() {
    fileList.innerHTML = '';

    pdfEntries.forEach((entry, idx) => {
      const item = document.createElement('div');
      item.className = 'file-list-item';
      item.setAttribute('draggable', 'true');
      item.dataset.index = idx;

      /* Drag handle */
      const handle = document.createElement('span');
      handle.className = 'btn-icon drag-handle';
      handle.innerHTML = '&#9776;'; // ☰ hamburger icon
      handle.title = 'Drag to reorder';
      handle.style.cursor = 'grab';
      item.appendChild(handle);

      /* Filename */
      const nameSpan = document.createElement('span');
      nameSpan.className = 'file-name';
      nameSpan.textContent = entry.file.name;
      nameSpan.style.flex = '1';
      nameSpan.style.overflow = 'hidden';
      nameSpan.style.textOverflow = 'ellipsis';
      nameSpan.style.whiteSpace = 'nowrap';
      item.appendChild(nameSpan);

      /* File size */
      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'file-size';
      sizeSpan.textContent = formatSize(entry.file.size);
      sizeSpan.style.opacity = '0.7';
      sizeSpan.style.marginRight = '8px';
      item.appendChild(sizeSpan);

      /* Page count chip */
      const pageChip = document.createElement('span');
      pageChip.className = 'chip';
      pageChip.textContent = `${entry.pageCount} page${entry.pageCount !== 1 ? 's' : ''}`;
      item.appendChild(pageChip);

      /* Remove button */
      const btnRemove = document.createElement('button');
      btnRemove.className = 'btn-icon';
      btnRemove.innerHTML = '&times;';
      btnRemove.title = 'Remove';
      btnRemove.addEventListener('click', () => {
        pdfEntries.splice(idx, 1);
        renderFileList();
        if (pdfEntries.length === 0) {
          listSection.style.display = 'none';
          actionRow.style.display = 'none';
          dropzoneWrapper.style.display = '';
        }
      });
      item.appendChild(btnRemove);

      /* ── Drag-and-drop events ───────────────────────── */
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        draggedIdx = idx;
        item.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.style.opacity = '';
        draggedItem = null;
        draggedIdx = -1;
        // Remove any remaining drag-over styles
        fileList.querySelectorAll('.file-list-item').forEach(el => {
          el.classList.remove('drag-over');
        });
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');

        const targetIdx = parseInt(item.dataset.index, 10);
        if (draggedIdx === -1 || draggedIdx === targetIdx) return;

        // Reorder the entries array
        const [moved] = pdfEntries.splice(draggedIdx, 1);
        pdfEntries.splice(targetIdx, 0, moved);
        renderFileList();
      });

      fileList.appendChild(item);
    });
  }

  /* ── Merge logic ───────────────────────────────────── */

  async function handleMerge() {
    if (pdfEntries.length < 2) {
      showToast('Add at least 2 PDF files to merge.', 'error');
      return;
    }

    try {
      btnMerge.disabled = true;
      progress.show();
      progress.set(0, 'Merging PDFs…');

      const mergedDoc = await PDFDocument.create();

      for (let i = 0; i < pdfEntries.length; i++) {
        const entry = pdfEntries[i];
        progress.set(
          Math.round((i / pdfEntries.length) * 85),
          `Merging "${entry.file.name}" (${i + 1}/${pdfEntries.length})…`
        );

        const arrayBuffer = await readFileAsArrayBuffer(entry.file);
        const srcDoc = await PDFDocument.load(arrayBuffer);
        const indices = srcDoc.getPageIndices();
        const copiedPages = await mergedDoc.copyPages(srcDoc, indices);
        copiedPages.forEach(page => mergedDoc.addPage(page));
      }

      progress.set(90, 'Saving merged PDF…');
      const mergedBytes = await mergedDoc.save();

      const totalPages = mergedDoc.getPageCount();
      downloadBytes(mergedBytes, 'merged.pdf', 'application/pdf');

      progress.set(100, 'Done');
      showToast(`Merged ${pdfEntries.length} files (${totalPages} pages) successfully!`, 'success');
      setTimeout(() => progress.hide(), 800);
    } catch (err) {
      console.error(err);
      showToast(`Merge failed: ${err.message}`, 'error');
      progress.hide();
    } finally {
      btnMerge.disabled = false;
    }
  }
}
