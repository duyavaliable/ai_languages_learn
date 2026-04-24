import PizZip from 'pizzip';
import { XMLParser } from 'fast-xml-parser';
import PDFParser from 'pdf2json';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

const HEADER_KEYWORDS = {
  word: ['english', 'word', 'vocabulary', 'tu', 'tieng anh', 'từ', 'tienganh'],
  pronunciation: ['pronunciation', 'phonetic', 'ipa', 'phien am', 'phiên âm'],
  meaning: ['meaning', 'definition', 'vietnamese', 'nghia', 'nghĩa', 'nghia tieng viet', 'nghĩa tiếng việt']
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
};

const safeText = (value) => String(value || '')
  .replace(/\s+/g, ' ')
  .replace(/[\u0000-\u001F]+/g, ' ')
  .trim();

const normalizeHeader = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const detectFileType = (file) => {
  const mime = String(file?.mimetype || '').toLowerCase();
  const name = String(file?.originalname || '').toLowerCase();

  if (mime === DOCX_MIME || name.endsWith('.docx')) {
    return 'docx';
  }

  if (mime === PDF_MIME || name.endsWith('.pdf')) {
    return 'pdf';
  }

  if (mime === 'text/plain' || name.endsWith('.txt')) {
    return 'txt';
  }

  return 'unknown';
};

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: false
});

const normalizeTextKeepTabs = (value) => String(value || '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, ' ')
  .replace(/[ \u00A0]+/g, ' ')
  .replace(/\s*\t\s*/g, '\t')
  .trim();

const extractNodeText = (node) => {
  if (typeof node === 'string') {
    return safeText(node);
  }

  if (!node || typeof node !== 'object') {
    return '';
  }

  if (Object.prototype.hasOwnProperty.call(node, 't')) {
    return toArray(node.t)
      .map((item) => extractNodeText(item))
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  return Object.values(node)
    .flatMap((value) => toArray(value))
    .map((value) => extractNodeText(value))
    .filter(Boolean)
    .join(' ')
    .trim();
};

const getDocxRows = (docXml) => {
  const rows = [];
  const tables = toArray(docXml?.document?.body?.tbl);

  for (const table of tables) {
    const trList = toArray(table?.tr);
    for (const tr of trList) {
      const tcList = toArray(tr?.tc);
      const row = tcList
        .map((cell) => {
          const paragraphs = toArray(cell?.p);
          const text = paragraphs
            .map((p) => extractNodeText(p))
            .filter(Boolean)
            .join(' ')
            .trim();
          return safeText(text);
        })
        .filter((value, idx, arr) => value || idx < arr.length - 1);

      if (row.length > 0) {
        rows.push(row);
      }
    }
  }

  return rows;
};

const getParagraphRuns = (paragraph) => {
  const directRuns = toArray(paragraph?.r);
  const hyperlinkRuns = toArray(paragraph?.hyperlink).flatMap((item) => toArray(item?.r));
  return [...directRuns, ...hyperlinkRuns];
};

const paragraphToLine = (paragraph) => {
  const runs = getParagraphRuns(paragraph);
  if (!runs.length) {
    return normalizeTextKeepTabs(extractNodeText(paragraph));
  }

  let line = '';
  for (const run of runs) {
    if (run?.tab !== undefined) {
      const tabs = Math.max(1, toArray(run.tab).length);
      line += '\t'.repeat(tabs);
    }

    if (run?.br !== undefined) {
      line += ' ';
    }

    if (run?.t !== undefined) {
      const text = toArray(run.t)
        .map((value) => String(value || ''))
        .join('');
      line += text;
    }
  }

  return normalizeTextKeepTabs(line);
};

const getDocxParagraphRows = (docXml) => {
  const paragraphs = toArray(docXml?.document?.body?.p);
  const rows = [];

  for (const paragraph of paragraphs) {
    const line = paragraphToLine(paragraph);
    if (!line || !line.includes('\t')) {
      continue;
    }

    const cells = line
      .split('\t')
      .map((cell) => safeText(cell));

    if (cells.filter(Boolean).length >= 2) {
      rows.push(cells);
    }
  }

  return rows;
};

const getDocxRawText = (docXml) => {
  const paragraphs = toArray(docXml?.document?.body?.p);
  return paragraphs
    .map((p) => paragraphToLine(p) || extractNodeText(p))
    .map((line) => normalizeTextKeepTabs(line).replace(/\t/g, ' '))
    .map((line) => safeText(line))
    .filter(Boolean)
    .join('\n');
};

const parseDocx = (buffer) => {
  const zip = new PizZip(buffer);
  const file = zip.file('word/document.xml');

  if (!file) {
    throw new Error('DOCX is invalid: cannot find word/document.xml');
  }

  const xml = file.asText();
  const json = xmlParser.parse(xml);

  const tableRows = [
    ...getDocxRows(json),
    ...getDocxParagraphRows(json)
  ];
  const rawText = getDocxRawText(json);

  return {
    fileType: 'docx',
    tableRows,
    rawText,
    usedTable: tableRows.length > 0
  };
};

const parsePdfBuffer = (buffer) => new Promise((resolve, reject) => {
  const parser = new PDFParser(null, 1);
  parser.on('pdfParser_dataError', (err) => reject(err?.parserError || err));
  parser.on('pdfParser_dataReady', (pdfData) => resolve(pdfData));
  parser.parseBuffer(buffer);
});

const decodePdfText = (encoded) => {
  try {
    return decodeURIComponent(encoded || '');
  } catch (_err) {
    return String(encoded || '');
  }
};

const mergeNearbyText = (texts, mergeGap = 1.5) => {
  const ordered = [...texts].sort((a, b) => a.x - b.x);
  const merged = [];
  let current = null;

  for (const item of ordered) {
    const text = safeText(item.text);
    if (!text) continue;

    if (!current) {
      current = {
        text,
        x: item.x,
        y: item.y,
        lastX: item.x
      };
      continue;
    }

    const gap = item.x - current.lastX;
    if (gap < mergeGap) {
      current.text += text;
    } else {
      merged.push({ x: current.x, y: current.y, text: safeText(current.text) });
      current = {
        text,
        x: item.x,
        y: item.y,
        lastX: item.x
      };
    }

    current.lastX = item.x;
  }

  if (current) {
    merged.push({ x: current.x, y: current.y, text: safeText(current.text) });
  }

  return merged;
};

const groupPdfRows = (texts, tolerance = 0.45) => {
  const ordered = [...texts].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const rows = [];

  for (const item of ordered) {
    const found = rows.find((row) => Math.abs(row.y - item.y) <= tolerance);
    if (found) {
      found.items.push(item);
      found.y = (found.y + item.y) / 2;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows.map((row) => row.items.sort((a, b) => a.x - b.x));
};

const buildPdfCells = (items) => {
  if (!items.length) return [];

  const sorted = [...items].sort((a, b) => a.x - b.x);
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(sorted[i].x - sorted[i - 1].x);
  }
  const avgGap = gaps.length ? (gaps.reduce((sum, val) => sum + val, 0) / gaps.length) : 0;
  const splitGap = Math.max(2.6, avgGap * 1.7);

  const cells = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const currentItem = sorted[i];
    const prevItem = sorted[i - 1];
    const gap = currentItem.x - prevItem.x;

    if (gap >= splitGap) {
      cells.push(current);
      current = [currentItem];
    } else {
      current.push(currentItem);
    }
  }

  cells.push(current);

  return cells
    .map((cellItems) => safeText(cellItems.map((cell) => cell.text).join(' ')))
    .filter(Boolean);
};

const parsePdf = async (buffer) => {
  const pdfData = await parsePdfBuffer(buffer);
  const pages = toArray(pdfData?.Pages);

  const tableRows = [];
  const rawLines = [];

  for (const page of pages) {
    const textItems = toArray(page?.Texts).map((item) => {
      const text = toArray(item?.R)
        .map((part) => decodePdfText(part?.T))
        .join('');

      return {
        x: Number(item?.x || 0),
        y: Number(item?.y || 0),
        text: safeText(text)
      };
    }).filter((item) => item.text);

    const groupedRows = groupPdfRows(textItems);

    for (const rowItems of groupedRows) {
      const mergedItems = mergeNearbyText(rowItems);
      const fullLine = safeText(mergedItems.map((it) => it.text).join(' '));
      if (fullLine) {
        rawLines.push(fullLine);
      }

      const cells = buildPdfCells(mergedItems);
      if (cells.length >= 2) {
        tableRows.push(cells);
      }
    }
  }

  return {
    fileType: 'pdf',
    tableRows,
    rawText: rawLines.join('\n'),
    usedTable: tableRows.length > 0
  };
};

const parseTxt = (buffer) => {
  const rawText = buffer.toString('utf-8');
  return {
    fileType: 'txt',
    tableRows: [],
    rawText,
    usedTable: false
  };
};

const detectHeaderIndexes = (row) => {
  const indexes = {
    word: -1,
    pronunciation: -1,
    meaning: -1
  };

  row.forEach((cell, idx) => {
    const normalized = normalizeHeader(cell);

    if (indexes.word === -1 && HEADER_KEYWORDS.word.some((key) => normalized.includes(key))) {
      indexes.word = idx;
    }

    if (indexes.pronunciation === -1 && HEADER_KEYWORDS.pronunciation.some((key) => normalized.includes(key))) {
      indexes.pronunciation = idx;
    }

    if (indexes.meaning === -1 && HEADER_KEYWORDS.meaning.some((key) => normalized.includes(key))) {
      indexes.meaning = idx;
    }
  });

  return indexes;
};

const isHeaderRow = (row) => {
  const found = detectHeaderIndexes(row);
  return found.word !== -1 && found.meaning !== -1;
};

const cleanupCell = (value) => safeText(value)
  .replace(/^[\-\u2022\*\u00B7\d\.\)\(\s]+/, '')
  .trim();

const POS_TOKEN_REGEX = /^\((n|v|adj|adv|prep|conj|pron|det|interj|phr\.?\s*v|modal|aux)\)$/i;

const isPosToken = (value) => POS_TOKEN_REGEX.test(String(value || '').trim());

const isPronunciationLike = (value) => {
  const text = String(value || '').trim();
  return /^\/.+\/$/.test(text) || /^\[[^\]]+\]$/.test(text);
};

const normalizePartOfSpeech = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text
    .replace(/^\(|\)$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalized;
};

const extractWordAndPos = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return { cleanWord: '', partOfSpeech: '' };
  }

  const posMatches = [...text.matchAll(/\((n|v|adj|adv|prep|conj|pron|det|interj|phr\.?\s*v|modal|aux)\)/gi)];
  const partOfSpeech = posMatches.length > 0
    ? normalizePartOfSpeech(posMatches[posMatches.length - 1][1])
    : '';

  const cleanWord = text
    .replace(/\((n|v|adj|adv|prep|conj|pron|det|interj|phr\.?\s*v|modal|aux)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    cleanWord,
    partOfSpeech
  };
};

const splitInlinePronunciation = (word, pronunciation) => {
  if (pronunciation) {
    return { word, pronunciation };
  }

  const text = String(word || '');
  const slash = text.match(/(.+?)\s*(\/[^\n\/]+\/)/);
  if (slash) {
    return {
      word: cleanupCell(slash[1]),
      pronunciation: cleanupCell(slash[2])
    };
  }

  const bracket = text.match(/(.+?)\s*(\[[^\]]+\])/);
  if (bracket) {
    return {
      word: cleanupCell(bracket[1]),
      pronunciation: cleanupCell(bracket[2])
    };
  }

  return { word, pronunciation };
};

const normalizeVocabularyRow = (rawRow) => {
  const cleanedWord = cleanupCell(rawRow.word);
  const cleanedPronunciation = cleanupCell(rawRow.pronunciation);
  const cleanedMeaning = cleanupCell(rawRow.meaning);

  const split = splitInlinePronunciation(cleanedWord, cleanedPronunciation);
  const extracted = extractWordAndPos(split.word);
  const fallbackPos = normalizePartOfSpeech(rawRow.part_of_speech);
  const partOfSpeech = fallbackPos || extracted.partOfSpeech;
  const displayWord = partOfSpeech
    ? `${extracted.cleanWord} (${partOfSpeech})`
    : extracted.cleanWord;

  return {
    word: displayWord,
    part_of_speech: partOfSpeech,
    pronunciation: split.pronunciation,
    meaning: cleanedMeaning,
    example_sentence: cleanupCell(rawRow.example_sentence || ''),
    example_translation: cleanupCell(rawRow.example_translation || '')
  };
};

const rowsToVocabulary = (rows) => {
  if (!rows.length) {
    return [];
  }

  let firstDataIndex = 0;
  let columnMap = { word: 0, pronunciation: 1, meaning: 2 };

  for (let i = 0; i < Math.min(rows.length, 3); i += 1) {
    const row = rows[i].map((cell) => safeText(cell));
    if (isHeaderRow(row)) {
      const detected = detectHeaderIndexes(row);
      columnMap = {
        word: detected.word !== -1 ? detected.word : 0,
        pronunciation: detected.pronunciation,
        meaning: detected.meaning !== -1 ? detected.meaning : 2
      };
      firstDataIndex = i + 1;
      break;
    }
  }

  const normalized = rows
    .slice(firstDataIndex)
    .map((row) => {
      let word = row[columnMap.word] || row[0] || '';
      let pronunciation = columnMap.pronunciation !== -1 ? (row[columnMap.pronunciation] || '') : (row[1] || '');
      let meaning = row[columnMap.meaning] || row[2] || row.slice(1).join(' ');
      let partOfSpeech = '';

      // Heuristic: handle split rows like [word, (n), /ipa/, meaning].
      if (row.length >= 4 && isPosToken(row[1]) && isPronunciationLike(row[2])) {
        word = row[0] || word;
        partOfSpeech = row[1];
        pronunciation = row[2] || pronunciation;
        meaning = row.slice(3).join(' ') || meaning;
      }

      return normalizeVocabularyRow({
        word,
        part_of_speech: partOfSpeech,
        pronunciation,
        meaning
      });
    })
    .filter((item) => item.word || item.meaning);

  return normalized;
};

const splitRawLineToRow = (line) => {
  const normalized = String(line || '').trim();
  if (!normalized) return [];

  if (normalized.includes('|')) {
    return normalized.split('|').map((part) => safeText(part));
  }

  if (normalized.includes('\t')) {
    return normalized.split('\t').map((part) => safeText(part));
  }

  if (normalized.includes(';')) {
    return normalized.split(';').map((part) => safeText(part));
  }

  const bySpaces = normalized.split(/\s{2,}/g).map((part) => safeText(part)).filter(Boolean);
  if (bySpaces.length >= 2) {
    return bySpaces;
  }

  return [normalized];
};

const parseRawTextVocabularyLine = (line) => {
  const normalized = cleanupCell(line);
  if (!normalized) return null;

  const slashIpaPattern = /^(.+?)\s*\/\s*(.+?)\s*\/\s*[:\-\u2013\u2014]\s*(.+)$/;
  const slashNoDelimiterPattern = /^(.+?)\s*\/\s*(.+?)\s*\/\s+(.+)$/;
  const bracketIpaPattern = /^(.+?)\s*(\[[^\]]+\])\s*[:\-\u2013\u2014]\s*(.+)$/;
  const wordMeaningPattern = /^(.+?)\s*[:\-\u2013\u2014]\s*(.+)$/;

  const slashMatch = normalized.match(slashIpaPattern) || normalized.match(slashNoDelimiterPattern);
  if (slashMatch) {
    return {
      word: cleanupCell(slashMatch[1]),
      pronunciation: `/${cleanupCell(slashMatch[2])}/`,
      meaning: cleanupCell(slashMatch[3])
    };
  }

  const bracketMatch = normalized.match(bracketIpaPattern);
  if (bracketMatch) {
    return {
      word: cleanupCell(bracketMatch[1]),
      pronunciation: cleanupCell(bracketMatch[2]),
      meaning: cleanupCell(bracketMatch[3])
    };
  }

  const wordMeaningMatch = normalized.match(wordMeaningPattern);
  if (wordMeaningMatch) {
    return {
      word: cleanupCell(wordMeaningMatch[1]),
      pronunciation: '',
      meaning: cleanupCell(wordMeaningMatch[2])
    };
  }

  return null;
};

const rawTextToVocabulary = (rawText) => {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => safeText(line))
    .filter(Boolean);

  const rows = lines
    .map((line) => splitRawLineToRow(line))
    .filter((parts) => parts.length >= 2);

  const rowItems = rowsToVocabulary(rows);
  if (rowItems.length > 0) {
    return rowItems;
  }

  const lineItems = lines
    .map((line) => parseRawTextVocabularyLine(line))
    .filter(Boolean)
    .map((item) => normalizeVocabularyRow(item))
    .filter((item) => item.word || item.meaning);

  return lineItems;
};

export const parseVocabularyUpload = async (file) => {
  const fileType = detectFileType(file);

  if (fileType === 'unknown') {
    throw new Error('Unsupported file type. Please upload PDF, DOCX or TXT');
  }

  let parseResult;
  if (fileType === 'docx') {
    parseResult = parseDocx(file.buffer);
  } else if (fileType === 'pdf') {
    parseResult = await parsePdf(file.buffer);
  } else {
    parseResult = parseTxt(file.buffer);
  }

  const tableItems = rowsToVocabulary(parseResult.tableRows);
  const hasTableResult = tableItems.length > 0;
  const fallbackItems = hasTableResult ? [] : rawTextToVocabulary(parseResult.rawText);

  const items = hasTableResult ? tableItems : fallbackItems;

  return {
    fileType,
    source: hasTableResult ? 'table' : 'raw_text_fallback',
    usedTable: parseResult.usedTable,
    totalTableRows: parseResult.tableRows.length,
    totalItems: items.length,
    items,
    rawText: parseResult.rawText
  };
};
