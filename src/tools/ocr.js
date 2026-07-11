import { createDropzone } from '../components/file-dropzone.js';
import { createProgressBar } from '../components/progress-bar.js';
import { showToast } from '../components/toast.js';
import { renderPageToCanvas, loadPdfJs } from '../utils/pdf-utils.js';
import { readFileAsArrayBuffer, downloadBlob } from '../utils/file-utils.js';
import Tesseract from 'tesseract.js/dist/tesseract.esm.min.js';

const SUPPORTED_LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'tur', label: 'Turkish' },
  { code: 'deu', label: 'German' },
  { code: 'fra', label: 'French' },
  { code: 'spa', label: 'Spanish' },
  { code: 'ara', label: 'Arabic' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' },
  { code: 'rus', label: 'Russian' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
];

/**
 * Render the OCR tool UI into the given container.
 * @param {HTMLElement} container
 */
export function render(container) {
  let extractedText = '';

  // --- Language selector ---
  const optionsSection = document.createElement('div');
  optionsSection.className = 'tool-options';

  const langGroup = document.createElement('div');
  langGroup.className = 'input-group';

  const langLabel = document.createElement('label');
  langLabel.textContent = 'OCR Language';
  langLabel.setAttribute('for', 'ocr-lang-select');

  const langSelect = document.createElement('select');
  langSelect.id = 'ocr-lang-select';
  SUPPORTED_LANGUAGES.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.label;
    langSelect.appendChild(opt);
  });

  langGroup.appendChild(langLabel);
  langGroup.appendChild(langSelect);
  optionsSection.appendChild(langGroup);
  container.appendChild(optionsSection);

  // --- File dropzone ---
  const dropzone = createDropzone({
    accept: '.pdf,.png,.jpg,.jpeg',
    label: 'Drop a PDF or image here, or click to browse',
    onFile: handleFile,
  });
  container.appendChild(dropzone.element);

  // --- Progress bar ---
  const { element: progressEl, update: updateProgress, show: showProgress, hide: hideProgress } = createProgressBar();
  container.appendChild(progressEl);
  hideProgress();

  // --- Status / stats ---
  const statsEl = document.createElement('div');
  statsEl.className = 'tool-stats';
  statsEl.style.display = 'none';
  container.appendChild(statsEl);

  // --- Text output ---
  const outputWrapper = document.createElement('div');
  outputWrapper.className = 'text-output';
  outputWrapper.style.display = 'none';

  const outputPre = document.createElement('pre');
  outputWrapper.appendChild(outputPre);
  container.appendChild(outputWrapper);

  // --- Action buttons ---
  const actionsRow = document.createElement('div');
  actionsRow.className = 'tool-actions';
  actionsRow.style.display = 'none';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-secondary';
  copyBtn.textContent = 'Copy All';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(extractedText)
      .then(() => showToast('Text copied to clipboard', 'success'))
      .catch(() => showToast('Failed to copy text', 'error'));
  });

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-primary';
  downloadBtn.textContent = 'Download .txt';
  downloadBtn.addEventListener('click', () => {
    try {
      downloadBlob(new Blob([extractedText], { type: 'text/plain' }), 'ocr-result.txt');
      showToast('Text file downloaded', 'success');
    } catch (err) {
      showToast('Download failed: ' + err.message, 'error');
    }
  });

  actionsRow.appendChild(copyBtn);
  actionsRow.appendChild(downloadBtn);
  container.appendChild(actionsRow);

  // -------------------------------------------------------
  // Handler
  // -------------------------------------------------------
  async function handleFile(file) {
    extractedText = '';
    outputPre.textContent = '';
    outputWrapper.style.display = 'none';
    actionsRow.style.display = 'none';
    statsEl.style.display = 'none';
    showProgress();
    updateProgress(0, 'Preparing…');

    const lang = langSelect.value;

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        await processPdf(file, lang);
      } else {
        await processImage(file, lang);
      }
    } catch (err) {
      console.error('[OCR]', err);
      showToast('OCR failed: ' + err.message, 'error');
      hideProgress();
    }
  }

  // -------------------------------------------------------
  // PDF processing
  // -------------------------------------------------------
  async function processPdf(file, lang) {
    updateProgress(5, 'Loading PDF…');

    const arrayBuffer = await readFileAsArrayBuffer(file);
    const pdf = await loadPdfJs(arrayBuffer);
    const totalPages = pdf.numPages;

    updateProgress(10, `PDF loaded — ${totalPages} page(s)`);

    const pageTexts = [];
    const confidences = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // Render page to canvas at 2× scale
      updateProgress(
        10 + ((pageNum - 1) / totalPages) * 80,
        `Rendering page ${pageNum} of ${totalPages}…`
      );

      const canvas = document.createElement('canvas');
      await renderPageToCanvas(pdf, pageNum, canvas, 2);

      // OCR
      updateProgress(
        10 + ((pageNum - 0.5) / totalPages) * 80,
        `Running OCR on page ${pageNum}…`
      );

      const { data } = await Tesseract.recognize(canvas, lang, {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pageFraction = (pageNum - 1 + m.progress) / totalPages;
            updateProgress(
              10 + pageFraction * 80,
              `OCR page ${pageNum}/${totalPages} — ${Math.round(m.progress * 100)}%`
            );
          }
        },
      });

      const pageText = data.text.trim();
      pageTexts.push(pageText);
      confidences.push(data.confidence);
    }

    // Assemble output
    extractedText = pageTexts
      .map((t, i) => `--- Page ${i + 1} ---\n${t}`)
      .join('\n\n');

    finishOcr(totalPages, confidences);
  }

  // -------------------------------------------------------
  // Image processing
  // -------------------------------------------------------
  async function processImage(file, lang) {
    updateProgress(10, 'Loading image…');

    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    updateProgress(20, 'Running OCR…');

    const { data } = await Tesseract.recognize(canvas, lang, {
      logger: m => {
        if (m.status === 'recognizing text') {
          updateProgress(20 + m.progress * 70, `OCR — ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    extractedText = data.text.trim();
    finishOcr(1, [data.confidence]);
  }

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  /**
   * Load an image File into an HTMLImageElement.
   */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Finalize the OCR run — show results, stats, and actions.
   */
  function finishOcr(totalPages, confidences) {
    updateProgress(100, 'Done');

    // Show text
    outputPre.textContent = extractedText;
    outputWrapper.style.display = '';

    // Show stats
    const avgConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    statsEl.innerHTML = '';
    const pagesChip = document.createElement('span');
    pagesChip.className = 'chip';
    pagesChip.textContent = `${totalPages} page(s) processed`;

    const confChip = document.createElement('span');
    confChip.className = 'chip';
    confChip.textContent = `Avg. confidence: ${avgConf.toFixed(1)}%`;

    statsEl.appendChild(pagesChip);
    statsEl.appendChild(confChip);

    // Per-page confidence chips
    if (confidences.length > 1) {
      confidences.forEach((c, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = `Page ${i + 1}: ${c.toFixed(1)}%`;
        statsEl.appendChild(chip);
      });
    }

    statsEl.style.display = '';
    actionsRow.style.display = '';

    setTimeout(() => hideProgress(), 1500);
    showToast(`OCR complete — ${totalPages} page(s)`, 'success');
  }
}
