# PDF Everything

PDF Everything is a 100% private, client-side PDF manipulation tool. It runs entirely in your browser using WebAssembly and modern web APIs, meaning **your files never leave your computer**.

## 🚀 Features (8 Powerful Tools)

1. **Split PDF**: Visually select pages, extract ranges, and download as a ZIP or merged file.
2. **Merge PDFs**: Drag and drop multiple PDFs, reorder them, and combine them into a single file.
3. **Convert PDF**: Convert PDFs to high-resolution PNG/JPG images, or convert multiple images back into a PDF.
4. **Index Content**: Automatically scan PDFs and group pages by keyword frequency using TF-IDF analysis.
5. **Add to PDF**: Insert blank pages, images, or other PDFs at any position within your document.
6. **Edit PDF**: An interactive page editor allowing you to reorder, delete, rotate pages, and add click-to-type text overlays.
7. **OCR to Text**: Extract text from scanned PDFs and images directly in your browser using Tesseract.js.
8. **Watermark**: Apply customizable text and image watermarks with precise control over position, angle, and opacity.

## 🛡️ Privacy First
No servers, no uploads, no cloud processing. Your documents are processed entirely in your browser's memory.

## 🛠️ Tech Stack
- **Vite**
- **PDF-lib** (PDF manipulation)
- **PDF.js** (PDF rendering)
- **Tesseract.js** (Optical Character Recognition)
- **Vanilla JS & CSS** (No bulky frameworks, pure performance)

## 💻 Running Locally

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build
```

## 🌐 Deployment
This project is configured to be automatically deployed to GitHub Pages via GitHub Actions.
