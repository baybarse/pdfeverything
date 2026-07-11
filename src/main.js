/* ============================================================
   PDF Everything — Main Entry Point
   Hash-based SPA router + homepage with tool cards
   ============================================================ */
import './style.css';

// Tool definitions
const TOOLS = [
  {
    id: 'split',
    name: 'Split PDF',
    desc: 'Divide a PDF into individual pages or custom page ranges.',
    iconClass: 'icon-split',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="7" height="18" rx="1.5"/><rect x="15" y="3" width="7" height="18" rx="1.5"/><path d="M12 7v10M10 12h4" opacity=".4"/></svg>`,
  },
  {
    id: 'merge',
    name: 'Merge PDFs',
    desc: 'Combine multiple PDF files into a single document.',
    iconClass: 'icon-merge',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 12h6" opacity=".5"/></svg>`,
  },
  {
    id: 'convert',
    name: 'Convert PDF',
    desc: 'Convert PDFs to images or images to PDFs with quality control.',
    iconClass: 'icon-convert',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`,
  },
  {
    id: 'index-content',
    name: 'Index Content',
    desc: 'Categorize PDF content into custom-defined sections automatically.',
    iconClass: 'icon-index',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h14"/><circle cx="19" cy="12" r="2" opacity=".5"/></svg>`,
  },
  {
    id: 'add-pages',
    name: 'Add to PDF',
    desc: 'Insert pages, images, or blank pages into an existing PDF.',
    iconClass: 'icon-add',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 12v6M9 15h6" opacity=".5"/></svg>`,
  },
  {
    id: 'edit',
    name: 'Edit PDF',
    desc: 'Delete, rotate, reorder pages and add text overlays.',
    iconClass: 'icon-edit',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  },
  {
    id: 'ocr',
    name: 'OCR to Text',
    desc: 'Extract text from scanned PDFs and images using optical character recognition.',
    iconClass: 'icon-ocr',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3"/><path d="M7 10h2M11 10h2M15 10h2M7 14h4M13 14h4" opacity=".5"/></svg>`,
  },
  {
    id: 'watermark',
    name: 'Watermark',
    desc: 'Add text or image watermarks with full control over position and opacity.',
    iconClass: 'icon-watermark',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z"/></svg>`,
  },
];

const arrowIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
const backIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
const shieldIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
const sparkleIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" opacity=".3"/><circle cx="12" cy="12" r="3"/></svg>`;

const app = document.getElementById('app');

// ============================================================
// ROUTER
// ============================================================
function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  return hash;
}

async function navigate(route) {
  window.location.hash = route;
}

async function handleRoute() {
  const route = getRoute();
  app.innerHTML = '';

  // Render header
  app.appendChild(renderHeader());

  if (route === '/' || route === '') {
    renderHomepage();
  } else {
    const toolId = route.replace('/', '');
    const tool = TOOLS.find(t => t.id === toolId);
    if (tool) {
      await renderToolPage(tool);
    } else {
      renderHomepage();
    }
  }

  // Render footer
  app.appendChild(renderFooter());
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);

// ============================================================
// HEADER
// ============================================================
function renderHeader() {
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="header-inner">
      <a class="header-logo" href="#/">
        <svg viewBox="0 0 64 64" fill="none">
          <defs><linearGradient id="hg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
          <rect width="64" height="64" rx="14" fill="url(#hg)"/>
          <path d="M18 14h18l10 10v26a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z" fill="#fff" fill-opacity=".9"/>
          <path d="M36 14l10 10h-6a4 4 0 0 1-4-4v-6z" fill="#c7d2fe"/>
          <rect x="20" y="30" width="18" height="2.5" rx="1.25" fill="#6366f1" fill-opacity=".6"/>
          <rect x="20" y="35" width="14" height="2.5" rx="1.25" fill="#6366f1" fill-opacity=".4"/>
          <rect x="20" y="40" width="16" height="2.5" rx="1.25" fill="#6366f1" fill-opacity=".3"/>
        </svg>
        <span class="header-logo-text">PDF Everything</span>
      </a>
      <button class="menu-toggle" id="menuToggle" aria-label="Toggle menu">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      </button>
      <nav class="header-nav" id="headerNav">
        <a href="#/">Home</a>
        <span class="header-badge"><span class="dot"></span> 100% Private</span>
      </nav>
    </div>
  `;

  const toggle = header.querySelector('#menuToggle');
  const nav = header.querySelector('#headerNav');
  toggle.addEventListener('click', () => nav.classList.toggle('open'));

  return header;
}

// ============================================================
// FOOTER
// ============================================================
function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <p>PDF Everything — All processing happens in your browser. No files are uploaded to any server.</p>
  `;
  return footer;
}

// ============================================================
// HOMEPAGE
// ============================================================
function renderHomepage() {
  // Hero
  const hero = document.createElement('section');
  hero.className = 'hero';
  hero.innerHTML = `
    <h1>Every PDF Tool You Need,<br/><span class="gradient-text">Right in Your Browser</span></h1>
    <p>Split, merge, convert, OCR, watermark, summarize and more — completely free, entirely private. Your files never leave your device.</p>
    <div class="hero-features">
      <div class="hero-feature">
        ${checkIcon}
        <span>No Upload Required</span>
      </div>
      <div class="hero-feature">
        ${shieldIcon}
        <span>100% Private & Secure</span>
      </div>
      <div class="hero-feature">
        ${sparkleIcon}
        <span>8 Powerful Tools</span>
      </div>
    </div>
  `;
  app.appendChild(hero);

  // Tools grid
  const section = document.createElement('section');
  section.className = 'tools-section';
  section.innerHTML = `<div class="tools-section-title">Choose a tool to get started</div>`;

  const grid = document.createElement('div');
  grid.className = 'tools-grid';

  TOOLS.forEach((tool, idx) => {
    const card = document.createElement('a');
    card.className = 'tool-card';
    card.href = `#${tool.id}`;
    card.style.animationDelay = `${idx * 50}ms`;
    card.style.animation = `fadeInUp 0.4s ease-out ${idx * 50}ms both`;
    card.innerHTML = `
      <div class="tool-card-icon ${tool.iconClass}">${tool.icon}</div>
      <h3>${tool.name}</h3>
      <p>${tool.desc}</p>
      <div class="tool-card-arrow">${arrowIcon}</div>
    `;
    grid.appendChild(card);
  });

  section.appendChild(grid);
  app.appendChild(section);
}

// ============================================================
// TOOL PAGE
// ============================================================
async function renderToolPage(tool) {
  const page = document.createElement('div');
  page.className = 'tool-page';

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'tool-back';
  backBtn.innerHTML = `${backIcon} <span>Back to Tools</span>`;
  backBtn.addEventListener('click', () => navigate('/'));
  page.appendChild(backBtn);

  // Tool header
  const header = document.createElement('div');
  header.className = 'tool-header';
  header.innerHTML = `
    <h1>
      <span class="tool-icon-inline ${tool.iconClass}">${tool.icon}</span>
      ${tool.name}
    </h1>
    <p>${tool.desc}</p>
  `;
  page.appendChild(header);

  // Tool content container
  const content = document.createElement('div');
  content.className = 'tool-content';
  page.appendChild(content);

  app.appendChild(page);

  // Lazy-load the tool module
  try {
    const module = await import(`./tools/${tool.id}.js`);
    module.render(content);
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <p>Failed to load tool module. Please try again.</p>
        <pre style="text-align:left; color:#ef4444; background:#111827; padding:1rem; border-radius:8px; font-size:12px; margin-top:1rem; overflow-x:auto;">${err.stack || err.message || String(err)}</pre>
      </div>
    `;
    console.error(err);
  }
}
