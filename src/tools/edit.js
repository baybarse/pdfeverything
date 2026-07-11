/* ============================================================
   Edit PDF Tool
   Delete, rotate, reorder pages and add text overlays
   ============================================================ */
import { createDropzone } from '../components/file-dropzone.js';
import { createProgressBar } from '../components/progress-bar.js';
import { showToast } from '../components/toast.js';
import { renderAllThumbnails, loadPdfJs } from '../utils/pdf-utils.js';
import { readFileAsArrayBuffer, downloadBytes } from '../utils/file-utils.js';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

/**
 * @typedef {{ sourceIndex: number, rotation: number, overlays: Array<{text:string,size:number,x:number,y:number}> }} PageState
 */

export function render(container) {
  container.innerHTML = '';

  let pdfFile = null;
  let pdfBuffer = null;
  /** @type {PageState[]} */
  let pages = [];
  const selectedPages = new Set();

  const card = document.createElement('div');
  card.className = 'card';
  container.appendChild(card);

  const dropzoneWrapper = document.createElement('div');
  card.appendChild(dropzoneWrapper);

  const dropzone = createDropzone({
    accept: '.pdf',
    multiple: false,
    label: 'Drop a PDF file here to edit',
    onFiles: handleFile,
  });
  dropzoneWrapper.appendChild(dropzone.element);

  const progress = createProgressBar();
  card.appendChild(progress.element);

  const editorSection = document.createElement('div');
  editorSection.style.display = 'none';
  card.appendChild(editorSection);

  const quickActions = document.createElement('div');
  quickActions.className = 'tool-actions';
  quickActions.style.flexWrap = 'wrap';
  quickActions.style.marginBottom = '12px';
  quickActions.innerHTML = `
    <button class="btn-secondary" id="edit-select-all">Select All</button>
    <button class="btn-secondary" id="edit-deselect">Deselect All</button>
    <button class="btn-secondary" id="edit-rotate-left">↺ 90°</button>
    <button class="btn-secondary" id="edit-rotate-right">↻ 90°</button>
    <button class="btn-danger" id="edit-delete">Delete Selected</button>
  `;
  editorSection.appendChild(quickActions);

  const thumbnailGrid = document.createElement('div');
  thumbnailGrid.className = 'thumbnail-grid';
  editorSection.appendChild(thumbnailGrid);

  // Replaced global text tool with interactive pencil tool

  const actionRow = document.createElement('div');
  actionRow.className = 'tool-actions';
  actionRow.style.marginTop = '16px';
  actionRow.innerHTML = `<button class="btn-primary" id="edit-save">Download Edited PDF</button>`;
  editorSection.appendChild(actionRow);

  function refreshSelection() {
    thumbnailGrid.querySelectorAll('.thumbnail-item').forEach((item, idx) => {
      item.classList.toggle('selected', selectedPages.has(idx));
      const canvas = item.querySelector('canvas');
      if (canvas) canvas.style.transform = `rotate(${pages[idx]?.rotation || 0}deg)`;
    });
  }

  function renderThumbnailsFromState() {
    const parent = thumbnailGrid;
    pages.forEach((state, visualIdx) => {
      parent.appendChild(state.element);
      state.element.dataset.visualIndex = String(visualIdx);
    });
    refreshSelection();
  }

  async function handleFile(files) {
    if (!files?.length) return;
    pdfFile = files[0];
    pdfBuffer = await readFileAsArrayBuffer(pdfFile);
    pages = [];
    selectedPages.clear();
    thumbnailGrid.innerHTML = '';

    try {
      progress.show();
      progress.set(0, 'Loading PDF…');

      await renderAllThumbnails(pdfBuffer, thumbnailGrid, {
        scale: 0.45,
        onProgress: (current, total) => {
          progress.set(Math.round((current / total) * 100), `Preview ${current}/${total}`);
        },
      });

      const items = thumbnailGrid.querySelectorAll('.thumbnail-item');
      pages = Array.from(items).map((item, i) => ({
        sourceIndex: i,
        rotation: 0,
        overlays: [],
        element: item,
      }));

      items.forEach((item, idx) => {
        item.style.cursor = 'pointer';
        item.setAttribute('draggable', 'true');
        item.dataset.visualIndex = String(idx);

        const overlay = document.createElement('div');
        overlay.className = 'thumbnail-actions';
        overlay.innerHTML = `
          <div class="thumbnail-action-btn edit-btn" title="Edit Page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </div>
          <div class="thumbnail-action-btn" title="Rotate 90°">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.92-10.27l-3.26-1.5"/></svg>
          </div>
          <div class="thumbnail-action-btn danger" title="Delete Page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </div>
        `;
        
        const [editBtn, rotateBtn, deleteBtn] = overlay.querySelectorAll('.thumbnail-action-btn');
        
        editBtn.addEventListener('click', (e) => {
           e.stopPropagation();
           const currentIdx = parseInt(item.dataset.visualIndex, 10);
           openEditorModal(currentIdx);
        });
        
        rotateBtn.addEventListener('click', (e) => {
           e.stopPropagation();
           const currentIdx = parseInt(item.dataset.visualIndex, 10);
           pages[currentIdx].rotation = (pages[currentIdx].rotation + 90) % 360;
           refreshSelection();
        });
        
        deleteBtn.addEventListener('click', (e) => {
           e.stopPropagation();
           const currentIdx = parseInt(item.dataset.visualIndex, 10);
           pages.splice(currentIdx, 1);
           item.remove();
           selectedPages.clear();
           
           renderThumbnailsFromState();
           showToast('Page deleted.', 'success');
           
           if (pages.length === 0) {
             editorSection.style.display = 'none';
             dropzoneWrapper.style.display = '';
           }
        });
        
        item.appendChild(overlay);

        item.addEventListener('click', () => {
          const currentIdx = parseInt(item.dataset.visualIndex, 10);
          if (selectedPages.has(currentIdx)) selectedPages.delete(currentIdx);
          else selectedPages.add(currentIdx);
          refreshSelection();
        });

        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', item.dataset.visualIndex);
          item.style.opacity = '0.5';
        });
        item.addEventListener('dragend', () => { item.style.opacity = ''; });
        item.addEventListener('dragover', (e) => e.preventDefault());
        item.addEventListener('drop', (e) => {
          e.preventDefault();
          const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
          const to = parseInt(item.dataset.visualIndex, 10);
          if (from === to || Number.isNaN(from)) return;
          const [moved] = pages.splice(from, 1);
          pages.splice(to, 0, moved);
          selectedPages.clear(); // Clear selection on move to avoid index shifting confusion
          renderThumbnailsFromState();
          showToast('Page order updated.', 'success');
        });
      });

      dropzoneWrapper.style.display = 'none';
      editorSection.style.display = '';
      progress.hide();
      showToast(`"${pdfFile.name}" loaded — ${pages.length} page(s)`, 'success');
    } catch (err) {
      progress.hide();
      showToast(`Failed to load PDF: ${err.message}`, 'error');
    }
  }

  card.querySelector('#edit-select-all').addEventListener('click', () => {
    selectedPages.clear();
    pages.forEach((_, i) => selectedPages.add(i));
    refreshSelection();
  });

  card.querySelector('#edit-deselect').addEventListener('click', () => {
    selectedPages.clear();
    refreshSelection();
  });

  card.querySelector('#edit-rotate-left').addEventListener('click', () => {
    if (!selectedPages.size) { showToast('Select pages first.', 'info'); return; }
    selectedPages.forEach(idx => {
      pages[idx].rotation = (pages[idx].rotation - 90 + 360) % 360;
    });
    refreshSelection();
  });

  card.querySelector('#edit-rotate-right').addEventListener('click', () => {
    if (!selectedPages.size) { showToast('Select pages first.', 'info'); return; }
    selectedPages.forEach(idx => {
      pages[idx].rotation = (pages[idx].rotation + 90) % 360;
    });
    refreshSelection();
  });

  card.querySelector('#edit-delete').addEventListener('click', () => {
    if (!selectedPages.size) { showToast('Select pages to delete.', 'info'); return; }
    const toDelete = [...selectedPages].sort((a, b) => b - a);
    toDelete.forEach(idx => {
      pages.splice(idx, 1);
      const item = thumbnailGrid.querySelectorAll('.thumbnail-item')[idx];
      item?.remove();
    });
    selectedPages.clear();

    if (pages.length === 0) {
      showToast('All pages deleted.', 'error');
      editorSection.style.display = 'none';
      dropzoneWrapper.style.display = '';
    } else {
      renderThumbnailsFromState();
      showToast(`${toDelete.length} page(s) deleted.`, 'success');
    }
  });

  // Old add-text logic removed

  card.querySelector('#edit-save').addEventListener('click', async () => {
    if (!pdfBuffer || pages.length === 0) return;

    try {
      progress.show();
      progress.set(10, 'Editing PDF…');

      const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      const newDoc = await PDFDocument.create();
      const font = await newDoc.embedFont(StandardFonts.Helvetica);

      for (let i = 0; i < pages.length; i++) {
        const state = pages[i];
        const [copied] = await newDoc.copyPages(srcDoc, [state.sourceIndex]);
        const page = newDoc.addPage(copied);

        if (state.rotation) page.setRotation(degrees(state.rotation));

        state.overlays.forEach(o => {
          const width = page.getWidth();
          const height = page.getHeight();
          page.drawText(o.text, {
            x: o.pctX * width,
            y: height - (o.pctY * height) - o.size,
            size: o.size,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
        });

        progress.set(10 + Math.round(((i + 1) / pages.length) * 80), `Page ${i + 1}/${pages.length}`);
      }

      progress.set(95, 'Saving…');
      const bytes = await newDoc.save();
      const baseName = pdfFile.name.replace(/\.pdf$/i, '');
      downloadBytes(bytes, `${baseName}-edited.pdf`);

      progress.set(100, 'Done!');
      showToast('Edited PDF downloaded!', 'success');
      setTimeout(() => progress.hide(), 600);
    } catch (err) {
      console.error(err);
      showToast(`Save failed: ${err.message}`, 'error');
      progress.hide();
    }
  });
  async function openEditorModal(visualIdx) {
    const state = pages[visualIdx];
    
    const modal = document.createElement('div');
    modal.className = 'editor-modal active';
    modal.innerHTML = `
      <div class="editor-header">
        <h3>Edit Page ${visualIdx + 1}</h3>
        <button class="editor-close" style="font-size: 1.5rem; line-height: 1;">&times;</button>
      </div>
      <div class="editor-body">
        <div class="editor-canvas-wrapper" id="editor-wrapper">
          <canvas id="editor-canvas"></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    const closeBtn = modal.querySelector('.editor-close');
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 200);
    });

    const wrapper = modal.querySelector('#editor-wrapper');
    const canvas = modal.querySelector('#editor-canvas');
    
    progress.show();
    progress.set(10, 'Loading high-res page...');
    
    try {
      const pdf = await loadPdfJs(pdfBuffer);
      const page = await pdf.getPage(state.sourceIndex + 1);
      const viewport = page.getViewport({ scale: 2.0, rotation: state.rotation });
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;
      
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      progress.hide();

      function renderOverlays() {
        wrapper.querySelectorAll('.editor-text-overlay').forEach(el => el.remove());
        state.overlays.forEach((o, overlayIdx) => {
          const el = document.createElement('div');
          el.className = 'editor-text-overlay';
          el.textContent = o.text;
          el.style.fontSize = `${o.size * 2}px`;
          el.style.left = `${o.pctX * 100}%`;
          el.style.top = `${o.pctY * 100}%`;
          el.title = "Click to remove";
          el.style.cursor = "pointer";
          
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            state.overlays.splice(overlayIdx, 1);
            renderOverlays();
          });
          
          wrapper.appendChild(el);
        });
      }
      
      renderOverlays();

      wrapper.addEventListener('click', (e) => {
        if (e.target !== canvas && e.target !== wrapper) return;
        
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        
        const pctX = cx / canvas.offsetWidth;
        const pctY = cy / canvas.offsetHeight;
        
        let popup = wrapper.querySelector('.editor-text-popup');
        if (popup) popup.remove();
        
        popup = document.createElement('div');
        popup.className = 'editor-text-popup';
        popup.style.left = `${cx}px`;
        popup.style.top = `${cy}px`;
        popup.innerHTML = `
          <input type="text" placeholder="Enter text..." autofocus />
          <div class="popup-actions">
            <input type="number" value="18" min="8" max="72" title="Font size" style="width:60px;" />
            <button class="btn-primary" style="padding: 4px 12px; min-width: 60px;">Add</button>
            <button class="btn-secondary popup-cancel" style="padding: 4px 12px;">Cancel</button>
          </div>
        `;
        wrapper.appendChild(popup);
        
        const textInput = popup.querySelector('input[type="text"]');
        const sizeInput = popup.querySelector('input[type="number"]');
        const btn = popup.querySelector('.btn-primary');
        const cancelBtn = popup.querySelector('.popup-cancel');
        
        textInput.focus();
        
        cancelBtn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          popup.remove();
        });
        
        const saveOverlay = () => {
          const text = textInput.value.trim();
          if (text) {
            const size = parseInt(sizeInput.value, 10) || 18;
            state.overlays.push({ text, size, pctX, pctY });
            renderOverlays();
          }
          popup.remove();
        };
        
        btn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          saveOverlay();
        });
        textInput.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') saveOverlay();
        });
      });
      
    } catch (err) {
      console.error(err);
      progress.hide();
      showToast('Failed to open editor.', 'error');
    }
  }
}
