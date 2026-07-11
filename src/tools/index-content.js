import { createDropzone } from '../components/file-dropzone.js';
import { createProgressBar } from '../components/progress-bar.js';
import { showToast } from '../components/toast.js';
import { extractAllText } from '../utils/pdf-utils.js';
import { readFileAsArrayBuffer, downloadBlob, downloadZip } from '../utils/file-utils.js';
import { categorizeByContent } from '../utils/text-utils.js';
import { PDFDocument } from 'pdf-lib';

function generateCategoryLabel(keywords, index) {
  if (keywords && keywords.length > 0) {
    const primary = keywords[0].charAt(0).toUpperCase() + keywords[0].slice(1);
    return primary;
  }
  return `Topic ${index + 1}`;
}

function renderResults(resultsContainer, categories) {
  resultsContainer.innerHTML = '';

  if (!categories || categories.length === 0) {
    resultsContainer.innerHTML = '<p class="text-muted">No categories were generated.</p>';
    return;
  }

  categories.forEach((cat, idx) => {
    const card = document.createElement('div');
    card.className = 'card';

    const label = generateCategoryLabel(cat.keywords, idx);
    const heading = document.createElement('h3');
    heading.textContent = `Category ${idx + 1}: ${label}`;
    card.appendChild(heading);

    if (cat.pages && cat.pages.length > 0) {
      const pagesRow = document.createElement('div');
      pagesRow.style.display = 'flex';
      pagesRow.style.flexWrap = 'wrap';
      pagesRow.style.gap = '0.4rem';
      pagesRow.style.marginBottom = '0.75rem';

      cat.pages.forEach((pageNum) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = `Page ${pageNum}`;
        pagesRow.appendChild(chip);
      });
      card.appendChild(pagesRow);
    }

    if (cat.keywords && cat.keywords.length > 0) {
      const kwLabel = document.createElement('p');
      kwLabel.innerHTML = `<strong>Top Keywords:</strong> ${cat.keywords.join(', ')}`;
      card.appendChild(kwLabel);
    }

    resultsContainer.appendChild(card);
  });
}

function categoriesToCSV(categories) {
  const rows = [['Category', 'Label', 'Pages', 'Keywords']];

  categories.forEach((cat, idx) => {
    const label = generateCategoryLabel(cat.keywords, idx);
    const pages = (cat.pages || []).join('; ');
    const keywords = (cat.keywords || []).join('; ');
    rows.push([idx + 1, label, pages, keywords]);
  });

  return rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');
}

async function buildCategoryPdfs(arrayBuffer, categories, baseName, onProgress) {
  const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const files = [];

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const pageIndices = (cat.pages || []).map(p => p - 1).filter(idx => idx >= 0 && idx < srcDoc.getPageCount());
    if (pageIndices.length === 0) continue;

    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, pageIndices);
    copied.forEach(page => newDoc.addPage(page));
    const bytes = await newDoc.save();

    const label = generateCategoryLabel(cat.keywords, i).replace(/[^\w\s-]/g, '').trim() || `category-${i + 1}`;
    files.push({
      name: `${baseName}/${label}.pdf`,
      data: bytes,
    });

    if (onProgress) onProgress(i + 1, categories.length);
  }

  return files;
}

export function render(container) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.innerHTML = `
    <h2>Index Content</h2>
    <p class="text-muted">Upload a PDF to automatically categorize its pages by content similarity.</p>
  `;
  container.appendChild(header);

  const dropzoneWrapper = document.createElement('div');
  container.appendChild(dropzoneWrapper);
  const dropzone = createDropzone(dropzoneWrapper, {
    accept: '.pdf',
    multiple: false,
    label: 'Drop a PDF here or click to upload',
  });

  const inputGroup = document.createElement('div');
  inputGroup.className = 'input-group';
  inputGroup.style.marginTop = '1rem';
  inputGroup.innerHTML = `
    <label for="ic-category-count">Number of categories</label>
    <input id="ic-category-count" type="number" value="3" min="2" max="20" />
  `;
  container.appendChild(inputGroup);

  const analyseBtn = document.createElement('button');
  analyseBtn.className = 'btn-primary';
  analyseBtn.textContent = 'Analyse';
  analyseBtn.style.marginTop = '1rem';
  container.appendChild(analyseBtn);

  const progressWrapper = document.createElement('div');
  progressWrapper.style.marginTop = '1rem';
  container.appendChild(progressWrapper);
  const progress = createProgressBar(progressWrapper);

  const resultsContainer = document.createElement('div');
  resultsContainer.style.marginTop = '1.5rem';
  container.appendChild(resultsContainer);

  const exportRow = document.createElement('div');
  exportRow.style.display = 'none';
  exportRow.style.gap = '0.5rem';
  exportRow.style.marginTop = '1rem';
  exportRow.style.flexWrap = 'wrap';
  exportRow.innerHTML = `
    <button class="btn-secondary" id="ic-export-json">Export JSON</button>
    <button class="btn-secondary" id="ic-export-csv">Export CSV</button>
    <button class="btn-primary" id="ic-export-zip">Download Categorized PDFs (ZIP)</button>
  `;
  container.appendChild(exportRow);

  let currentCategories = null;
  let currentFile = null;
  let currentBuffer = null;

  analyseBtn.addEventListener('click', async () => {
    const files = dropzone.getFiles();
    if (!files || files.length === 0) {
      showToast('Please upload a PDF first.', 'info');
      return;
    }

    const categoryCount = parseInt(
      document.getElementById('ic-category-count').value,
      10
    );
    if (isNaN(categoryCount) || categoryCount < 2 || categoryCount > 20) {
      showToast('Category count must be between 2 and 20.', 'info');
      return;
    }

    const file = files[0];
    currentFile = file;

    try {
      analyseBtn.disabled = true;
      resultsContainer.innerHTML = '';
      exportRow.style.display = 'none';
      currentCategories = null;
      currentBuffer = null;

      progress.show();
      progress.set(10, 'Reading file…');
      const arrayBuffer = await readFileAsArrayBuffer(file);
      currentBuffer = arrayBuffer;

      progress.set(30, 'Extracting text…');
      const { pages } = await extractAllText(arrayBuffer, (pageNum, totalPages) => {
        const pct = 30 + Math.round((pageNum / totalPages) * 40);
        progress.set(pct, `Extracting text… ${pageNum}/${totalPages}`);
      });

      if (!pages || pages.length === 0) {
        showToast('Could not extract text from this PDF.', 'error');
        progress.hide();
        return;
      }

      progress.set(75, 'Categorizing pages…');
      const categories = categorizeByContent(pages, categoryCount);

      progress.set(100, 'Done!');
      currentCategories = categories;

      renderResults(resultsContainer, categories);
      exportRow.style.display = 'flex';

      showToast('Categorization complete!', 'success');
      setTimeout(() => progress.hide(), 600);
    } catch (err) {
      console.error('Index Content error:', err);
      showToast(`Error: ${err.message || 'Something went wrong.'}`, 'error');
      progress.hide();
    } finally {
      analyseBtn.disabled = false;
    }
  });

  container.addEventListener('click', async (e) => {
    if (!currentCategories) return;

    if (e.target.id === 'ic-export-json') {
      const json = JSON.stringify(currentCategories, null, 2);
      downloadBlob(json, 'index-content.json', 'application/json');
      showToast('JSON exported.', 'success');
    }

    if (e.target.id === 'ic-export-csv') {
      const csv = categoriesToCSV(currentCategories);
      downloadBlob(csv, 'index-content.csv', 'text/csv');
      showToast('CSV exported.', 'success');
    }

    if (e.target.id === 'ic-export-zip') {
      if (!currentBuffer || !currentFile) {
        showToast('PDF data not found. Please analyse again.', 'error');
        return;
      }

      try {
        progress.show();
        progress.set(10, 'Building category PDFs…');
        const baseName = currentFile.name.replace(/\.pdf$/i, '');
        const files = await buildCategoryPdfs(
          currentBuffer,
          currentCategories,
          baseName,
          (done, total) => {
            progress.set(10 + Math.round((done / total) * 80), `Creating PDF ${done}/${total}`);
          }
        );

        if (files.length === 0) {
          showToast('No category PDFs could be created.', 'error');
          progress.hide();
          return;
        }

        progress.set(95, 'Creating ZIP…');
        await downloadZip(files, `${baseName}-categories.zip`);
        progress.set(100, 'Done!');
        showToast(`${files.length} categorized PDFs downloaded as ZIP!`, 'success');
        setTimeout(() => progress.hide(), 600);
      } catch (err) {
        console.error(err);
        showToast(`ZIP export failed: ${err.message}`, 'error');
        progress.hide();
      }
    }
  });
}
