import { createDropzone } from '../components/file-dropzone.js';
import { createProgressBar } from '../components/progress-bar.js';
import { showToast } from '../components/toast.js';
import { renderPageToCanvas, loadPdfJs } from '../utils/pdf-utils.js';
import { readFileAsArrayBuffer, downloadBytes, downloadZip, canvasToBlob } from '../utils/file-utils.js';
import { PDFDocument } from 'pdf-lib';

const PAGE_SIZES = {
  'A4': { width: 595, height: 842 },
  'Letter': { width: 612, height: 792 },
  'Fit to Image': null
};

export function render(container) {
  container.innerHTML = `
    <div class="tool-content">
      <div class="tabs">
        <button class="tab-btn active" data-tab="pdf-to-images">PDF to Images</button>
        <button class="tab-btn" data-tab="images-to-pdf">Images to PDF</button>
      </div>

      <!-- PDF to Images Tab -->
      <div class="tab-panel active" id="panel-pdf-to-images">
        <div id="pdf-to-img-dropzone"></div>
        <div class="convert-options" id="pdf-to-img-options" style="display:none;">
          <div class="option-group">
            <label for="output-format">Output Format</label>
            <select id="output-format">
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
          </div>
          <div class="option-group">
            <label for="output-scale">Scale</label>
            <select id="output-scale">
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2" selected>2x</option>
              <option value="3">3x</option>
            </select>
          </div>
          <button class="btn btn-primary" id="btn-convert-pdf">Convert to Images</button>
        </div>
        <div id="pdf-to-img-progress"></div>
        <div id="pdf-to-img-results" style="display:none;">
          <div class="results-header">
            <h3 id="pdf-to-img-count"></h3>
            <button class="btn btn-primary" id="btn-download-all-images">Download All as ZIP</button>
          </div>
          <div class="thumbnail-grid" id="pdf-to-img-grid"></div>
        </div>
      </div>

      <!-- Images to PDF Tab -->
      <div class="tab-panel" id="panel-images-to-pdf" style="display:none;">
        <div id="img-to-pdf-dropzone"></div>
        <div class="convert-options" id="img-to-pdf-options" style="display:none;">
          <div class="option-group">
            <label for="page-size">Page Size</label>
            <select id="page-size">
              <option value="A4">A4 (595×842)</option>
              <option value="Letter">Letter (612×792)</option>
              <option value="Fit to Image">Fit to Image</option>
            </select>
          </div>
          <button class="btn btn-primary" id="btn-convert-images">Create PDF</button>
        </div>
        <div id="img-to-pdf-preview" style="display:none;">
          <h3 id="img-to-pdf-count"></h3>
          <div class="thumbnail-grid" id="img-to-pdf-grid"></div>
        </div>
        <div id="img-to-pdf-progress"></div>
      </div>
    </div>
  `;

  // ── Tab Switching ──
  const tabBtns = container.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      container.querySelectorAll('.tab-panel').forEach(p => {
        p.style.display = 'none';
        p.classList.remove('active');
      });
      const panel = container.querySelector(`#panel-${btn.dataset.tab}`);
      panel.style.display = '';
      panel.classList.add('active');
    });
  });

  // ══════════════════════════════════════════
  // PDF → Images
  // ══════════════════════════════════════════
  let pdfFile = null;
  const convertedBlobs = [];

  createDropzone(container.querySelector('#pdf-to-img-dropzone'), {
    accept: '.pdf',
    multiple: false,
    label: 'Drop a PDF file here or click to browse',
    onFiles(files) {
      if (!files.length) return;
      pdfFile = files[0];
      container.querySelector('#pdf-to-img-options').style.display = '';
      showToast(`Loaded: ${pdfFile.name}`, 'success');
    }
  });

  container.querySelector('#btn-convert-pdf').addEventListener('click', async () => {
    if (!pdfFile) {
      showToast('Please upload a PDF first.', 'error');
      return;
    }

    const format = container.querySelector('#output-format').value;
    const scale = parseFloat(container.querySelector('#output-scale').value);
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';

    const progressContainer = container.querySelector('#pdf-to-img-progress');
    const { update, destroy } = createProgressBar(progressContainer);

    try {
      const arrayBuffer = await readFileAsArrayBuffer(pdfFile);
      const pdfjsLib = await loadPdfJs(arrayBuffer);
      const pdf = pdfjsLib;
      const totalPages = pdf.numPages;

      update(0, `Converting ${totalPages} pages...`);

      convertedBlobs.length = 0;
      const grid = container.querySelector('#pdf-to-img-grid');
      grid.innerHTML = '';

      for (let i = 1; i <= totalPages; i++) {
        const canvas = await renderPageToCanvas(pdf, i, scale);

        const blob = await canvasToBlob(canvas, mimeType);
        convertedBlobs.push({ blob, name: `page-${i}.${format}` });

        // Thumbnail
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-item';
        thumb.innerHTML = `
          <div class="thumbnail-img-wrapper">
            <img src="${URL.createObjectURL(blob)}" alt="Page ${i}" style="cursor: zoom-in; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'" />
          </div>
          <div class="thumbnail-footer">
            <span class="page-num">Page ${i}</span>
            <button class="btn btn-sm btn-secondary btn-download-single" data-index="${i - 1}">Download</button>
          </div>
        `;
        grid.appendChild(thumb);

        update(Math.round((i / totalPages) * 100), `Converted page ${i} of ${totalPages}`);
      }

      container.querySelector('#pdf-to-img-count').textContent = `${totalPages} pages converted`;
      container.querySelector('#pdf-to-img-results').style.display = '';

      destroy();
      showToast('Conversion complete!', 'success');
    } catch (err) {
      destroy();
      console.error(err);
      showToast(`Conversion failed: ${err.message}`, 'error');
    }
  });

  // Download individual images and Lightbox
  container.querySelector('#pdf-to-img-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-download-single');
    if (btn) {
      const idx = parseInt(btn.dataset.index, 10);
      const item = convertedBlobs[idx];
      if (item) downloadBytes(item.blob, item.name);
      return;
    }
    
    // Lightbox for image click
    const img = e.target.closest('.thumbnail-img-wrapper img');
    if (img) {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.9)', zIndex: '9999',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out', opacity: '0', transition: 'opacity 0.2s ease'
      });
      
      const lgImg = document.createElement('img');
      lgImg.src = img.src;
      Object.assign(lgImg.style, {
        maxWidth: '90%', maxHeight: '90%', objectFit: 'contain',
        borderRadius: '8px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        transform: 'scale(0.95)', transition: 'transform 0.2s ease'
      });
      
      overlay.appendChild(lgImg);
      document.body.appendChild(overlay);
      
      // Trigger animation
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        lgImg.style.transform = 'scale(1)';
      });
      
      overlay.addEventListener('click', () => {
        overlay.style.opacity = '0';
        lgImg.style.transform = 'scale(0.95)';
        setTimeout(() => overlay.remove(), 200);
      });
    }
  });

  // Download all as ZIP
  container.querySelector('#btn-download-all-images').addEventListener('click', async () => {
    if (!convertedBlobs.length) {
      showToast('No images to download.', 'error');
      return;
    }
    try {
      const files = convertedBlobs.map(b => ({ name: b.name, blob: b.blob }));
      const baseName = pdfFile ? pdfFile.name.replace(/\.pdf$/i, '') : 'converted';
      await downloadZip(files, `${baseName}-images.zip`);
      showToast('ZIP downloaded!', 'success');
    } catch (err) {
      console.error(err);
      showToast(`ZIP download failed: ${err.message}`, 'error');
    }
  });

  // ══════════════════════════════════════════
  // Images → PDF
  // ══════════════════════════════════════════
  let imageFiles = [];

  createDropzone(container.querySelector('#img-to-pdf-dropzone'), {
    accept: '.png,.jpg,.jpeg,.webp,.bmp',
    multiple: true,
    label: 'Drop images here or click to browse (PNG, JPG, WebP, BMP)',
    onFiles(files) {
      if (!files.length) return;
      imageFiles = Array.from(files);
      container.querySelector('#img-to-pdf-options').style.display = '';

      // Show preview
      const grid = container.querySelector('#img-to-pdf-grid');
      grid.innerHTML = '';
      imageFiles.forEach((file, i) => {
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-item';
        thumb.innerHTML = `
          <div class="thumbnail-img-wrapper">
            <img src="${URL.createObjectURL(file)}" alt="${file.name}" />
          </div>
          <div class="thumbnail-footer">
            <span class="page-num">${i + 1}</span>
            <span class="file-name" title="${file.name}">${file.name}</span>
          </div>
        `;
        grid.appendChild(thumb);
      });
      container.querySelector('#img-to-pdf-count').textContent = `${imageFiles.length} images selected`;
      container.querySelector('#img-to-pdf-preview').style.display = '';
      showToast(`${imageFiles.length} image(s) loaded.`, 'success');
    }
  });

  container.querySelector('#btn-convert-images').addEventListener('click', async () => {
    if (!imageFiles.length) {
      showToast('Please upload images first.', 'error');
      return;
    }

    const pageSizeKey = container.querySelector('#page-size').value;
    const pageSize = PAGE_SIZES[pageSizeKey];

    const progressContainer = container.querySelector('#img-to-pdf-progress');
    const { update, destroy } = createProgressBar(progressContainer);

    try {
      const pdfDoc = await PDFDocument.create();
      update(0, `Processing ${imageFiles.length} images...`);

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const buffer = await readFileAsArrayBuffer(file);
        const uint8 = new Uint8Array(buffer);

        let image;
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'png') {
          image = await pdfDoc.embedPng(uint8);
        } else if (ext === 'jpg' || ext === 'jpeg') {
          image = await pdfDoc.embedJpg(uint8);
        } else {
          // For WebP/BMP, convert via canvas first, then embed as PNG
          const bitmap = await createImageBitmap(new Blob([buffer], { type: file.type }));
          const cvs = document.createElement('canvas');
          cvs.width = bitmap.width;
          cvs.height = bitmap.height;
          const ctx = cvs.getContext('2d');
          ctx.drawImage(bitmap, 0, 0);
          const pngBlob = await canvasToBlob(cvs, 'image/png');
          const pngBuf = new Uint8Array(await pngBlob.arrayBuffer());
          image = await pdfDoc.embedPng(pngBuf);
          bitmap.close();
        }

        const imgWidth = image.width;
        const imgHeight = image.height;

        let pw, ph;
        if (pageSize) {
          pw = pageSize.width;
          ph = pageSize.height;
        } else {
          // Fit to image
          pw = imgWidth;
          ph = imgHeight;
        }

        const page = pdfDoc.addPage([pw, ph]);

        // Scale image to fit within page while maintaining aspect ratio
        let drawW, drawH, drawX, drawY;
        if (pageSize) {
          const scaleX = pw / imgWidth;
          const scaleY = ph / imgHeight;
          const s = Math.min(scaleX, scaleY);
          drawW = imgWidth * s;
          drawH = imgHeight * s;
          drawX = (pw - drawW) / 2;
          drawY = (ph - drawH) / 2;
        } else {
          drawW = pw;
          drawH = ph;
          drawX = 0;
          drawY = 0;
        }

        page.drawImage(image, {
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH
        });

        update(Math.round(((i + 1) / imageFiles.length) * 100), `Added image ${i + 1} of ${imageFiles.length}`);
      }

      const pdfBytes = await pdfDoc.save();
      downloadBytes(new Blob([pdfBytes], { type: 'application/pdf' }), 'converted-images.pdf');

      destroy();
      showToast('PDF created and downloaded!', 'success');
    } catch (err) {
      destroy();
      console.error(err);
      showToast(`PDF creation failed: ${err.message}`, 'error');
    }
  });
}
