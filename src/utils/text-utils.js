/* ============================================================
   Text Utilities — summarization & content categorization
   ============================================================ */

const STOP_WORDS = new Set([
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'it', 'its', 'he', 'she', 'they', 'them', 'their',
  'his', 'her', 'my', 'your', 'our', 'this', 'that', 'these', 'those', 'i', 'me', 'we', 'us', 'you',
  'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about', 'all', 'also', 'any',
  'because', 'before', 'between', 'both', 'each', 'few', 'more', 'most', 'other', 'out', 'over', 'same',
  'some', 'such', 'there', 'through', 'under', 'until', 'up', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'only', 'being', 'having', 'doing',
  // Turkish
  've', 'bir', 'bu', 'şu', 'o', 'de', 'da', 'ki', 'mi', 'mı', 'mu', 'mü', 'için', 'ile', 'gibi', 'kadar',
  'daha', 'çok', 'az', 'en', 'her', 'hiç', 'olan', 'olarak', 'olan', 'var', 'yok', 'ise', 'ama', 'fakat',
  'ancak', 'veya', 'ya', 'hem', 'ne', 'nasıl', 'neden', 'niçin', 'kim', 'kime', 'kimi', 'nerede', 'nereye',
  'nereden', 'hangi', 'ben', 'sen', 'biz', 'siz', 'onlar', 'benim', 'senin', 'onun', 'bizim', 'sizin',
  'onların', 'şey', 'şeyi', 'şeyler', 'olan', 'oldu', 'olur', 'olmuş', 'etmek', 'eder', 'etti', 'etmiş',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\wçğıöşüÇĞİÖŞÜ\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function splitSentences(text) {
  return text
    .replace(/\n+/g, '. ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

function termFrequency(tokens) {
  const freq = {};
  tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  const max = Math.max(...Object.values(freq), 1);
  for (const key in freq) freq[key] /= max;
  return freq;
}

function inverseDocumentFrequency(allTokenSets) {
  const n = allTokenSets.length;
  const df = {};
  allTokenSets.forEach(set => {
    new Set(set).forEach(t => { df[t] = (df[t] || 0) + 1; });
  });
  for (const key in df) df[key] = Math.log(n / df[key]) + 1;
  return df;
}

function scoreSentences(sentences) {
  const allTokens = sentences.map(s => tokenize(s));
  const idf = inverseDocumentFrequency(allTokens);

  return sentences.map((sentence, index) => {
    const tokens = allTokens[index];
    const tf = termFrequency(tokens);
    let score = 0;
    tokens.forEach(t => { score += (tf[t] || 0) * (idf[t] || 0); });
    score /= Math.max(tokens.length, 1);
    const positionBoost = 1 + 0.1 / (index + 1);
    return { sentence, score: score * positionBoost, index };
  });
}

function extractKeywords(text, limit = 10) {
  const tokens = tokenize(text);
  const freq = {};
  tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, score]) => ({ word, score }));
}

/**
 * Extractive summarization using TF-IDF sentence scoring.
 * @param {string} text
 * @param {{ length?: 'short'|'medium'|'long' }} [options]
 */
export function extractiveSummarize(text, options = {}) {
  const { length = 'medium' } = options;
  const sentences = splitSentences(text);

  if (sentences.length === 0) {
    return { summary: 'No extractable text found.', sentenceCount: 0, keywords: [] };
  }

  const ratios = { short: 0.15, medium: 0.3, long: 0.5 };
  const ratio = ratios[length] || 0.3;
  const count = Math.max(1, Math.min(Math.ceil(sentences.length * ratio), 50));

  const summary = scoreSentences(sentences)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map(s => s.sentence)
    .join(' ');

  const keywords = extractKeywords(text, 8).map(k => k.word);

  return { summary, sentenceCount: count, keywords };
}

/**
 * Categorize PDF pages by content similarity into N groups.
 * @param {Array<{pageNum: number, text: string}>} pages
 * @param {number} categoryCount
 */
export function categorizeByContent(pages, categoryCount) {
  const pageData = pages.map(page => {
    const tokens = tokenize(page.text);
    const freq = {};
    tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
    return { pageNum: page.pageNum, freq, tokens };
  });

  const categories = [];
  const chunkSize = Math.ceil(pages.length / categoryCount);

  for (let i = 0; i < categoryCount; i++) {
    const chunk = pageData.slice(i * chunkSize, (i + 1) * chunkSize);
    if (chunk.length === 0) continue;

    const combined = {};
    chunk.forEach(p => {
      for (const [word, count] of Object.entries(p.freq)) {
        combined[word] = (combined[word] || 0) + count;
      }
    });

    const keywords = Object.entries(combined)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    categories.push({
      category: i + 1,
      label: `Section ${i + 1}: ${keywords.slice(0, 3).join(', ')}`,
      pages: chunk.map(p => p.pageNum),
      keywords,
    });
  }

  return categories;
}
