/* ============================================================
   File Dropzone Component
   Reusable drag-and-drop file upload area
   ============================================================ */

const uploadIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;

/**
 * Create a file dropzone component.
 * Supports both signatures:
 *   createDropzone(options)
 *   createDropzone(parentElement, options)
 *
 * @param {HTMLElement|Object} parentOrOptions
 * @param {Object} [maybeOptions]
 * @returns {{ element: HTMLElement, el: HTMLElement, getFiles: () => File[], reset: () => void }}
 */
export function createDropzone(parentOrOptions, maybeOptions) {
  let parent = null;
  let options = {};

  if (parentOrOptions instanceof HTMLElement) {
    parent = parentOrOptions;
    options = maybeOptions || {};
  } else {
    options = parentOrOptions || {};
  }

  const {
    accept = '.pdf',
    multiple = false,
    label = 'Drop your PDF here',
    hint = 'or click to browse files',
    onFiles = null,
    onFile = null,
  } = options;

  let files = [];

  const el = document.createElement('div');
  el.className = 'dropzone';
  el.innerHTML = `
    <div class="dropzone-icon">${uploadIcon}</div>
    <h3>${label}</h3>
    <p>${hint}</p>
    <input type="file" accept="${accept}" ${multiple ? 'multiple' : ''} />
    <div class="file-info"></div>
  `;

  const input = el.querySelector('input[type="file"]');
  const fileInfo = el.querySelector('.file-info');

  function notify(filesList) {
    if (onFiles) onFiles(filesList);
    if (onFile && filesList.length > 0) onFile(filesList[0]);
  }

  function handleFiles(newFiles) {
    if (multiple) {
      files = [...files, ...Array.from(newFiles)];
    } else {
      files = Array.from(newFiles).slice(0, 1);
    }
    updateFileInfo();
    notify(files);
  }

  function updateFileInfo() {
    if (files.length === 0) {
      fileInfo.innerHTML = '';
      return;
    }
    fileInfo.innerHTML = files.map(f => `
      <span class="chip">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        ${f.name} (${formatSize(f.size)})
      </span>
    `).join('');
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  input.addEventListener('change', (e) => {
    if (e.target.files.length) handleFiles(e.target.files);
  });

  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  if (parent) parent.appendChild(el);

  return {
    element: el,
    el,
    getFiles: () => files,
    reset: () => {
      files = [];
      input.value = '';
      fileInfo.innerHTML = '';
    },
  };
}
