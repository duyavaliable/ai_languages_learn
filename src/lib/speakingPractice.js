export function normalizeToken(value) {
  const source = value && typeof value === 'object'
    ? String(value.normalized || value.text || value.rawText || '')
    : String(value || '');

  return source
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSpeakingText(value) {
  const source = String(value || '');
  if (!source.trim()) return [];

  const tokens = [];
  const pattern = /\S+/gu;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const text = String(match[0] || '').trim();
    const normalized = normalizeToken(text);
    if (!normalized) continue;

    tokens.push({
      text,
      rawText: text,
      normalized,
      start: match.index,
      end: match.index + text.length
    });
  }

  return tokens;
}

export function levenshteinDistance(left, right) {
  const a = String(left || '');
  const b = String(right || '');

  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, (_, row) => [row]);

  for (let column = 1; column <= a.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= b.length; row += 1) {
    for (let column = 1; column <= a.length; column += 1) {
      if (b.charAt(row - 1) === a.charAt(column - 1)) {
        matrix[row][column] = matrix[row - 1][column - 1];
      } else {
        matrix[row][column] = Math.min(
          matrix[row - 1][column - 1] + 1,
          matrix[row][column - 1] + 1,
          matrix[row - 1][column] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function similarityScore(left, right) {
  const a = normalizeToken(left).replace(/\s+/g, '');
  const b = normalizeToken(right).replace(/\s+/g, '');
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

export function alignSpeakingTranscript(scriptText, transcriptText) {
  const scriptTokens = tokenizeSpeakingText(scriptText);
  const transcriptTokens = tokenizeSpeakingText(transcriptText);
  const n = scriptTokens.length;
  const m = transcriptTokens.length;

  if (!n && !m) {
    return {
      alignedTokens: [],
      scriptTokens,
      transcriptTokens,
      counts: { correct: 0, addition: 0, omission: 0, mispronunciationCandidate: 0 },
      additions: [],
      omissions: [],
      mispronunciations: []
    };
  }

  const gapCost = 1;
  const substitutionCost = (expected, recognized) => {
    const similarity = similarityScore(expected, recognized);
    if (normalizeToken(expected) === normalizeToken(recognized)) return 0;
    if (similarity >= 0.6) return 0.45;
    return 1.15;
  };

  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  const back = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));

  for (let i = 1; i <= n; i += 1) {
    dp[i][0] = i * gapCost;
    back[i][0] = 'up';
  }
  for (let j = 1; j <= m; j += 1) {
    dp[0][j] = j * gapCost;
    back[0][j] = 'left';
  }

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const matchCost = dp[i - 1][j - 1] + substitutionCost(scriptTokens[i - 1], transcriptTokens[j - 1]);
      const deleteCost = dp[i - 1][j] + gapCost;
      const insertCost = dp[i][j - 1] + gapCost;

      let best = matchCost;
      let dir = 'diag';
      if (deleteCost < best) {
        best = deleteCost;
        dir = 'up';
      }
      if (insertCost < best) {
        best = insertCost;
        dir = 'left';
      }

      dp[i][j] = best;
      back[i][j] = dir;
    }
  }

  const alignedTokens = [];
  const additions = [];
  const omissions = [];
  const mispronunciations = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    const dir = back[i]?.[j];

    if (i > 0 && j > 0 && dir === 'diag') {
      const expected = scriptTokens[i - 1];
      const recognized = transcriptTokens[j - 1];
      const similarity = similarityScore(expected, recognized);
      const isExact = expected.normalized === recognized.normalized;
      const isMispronunciationCandidate = !isExact && similarity >= 0.6;

      alignedTokens.unshift({
        type: isExact ? 'correct' : isMispronunciationCandidate ? 'mispronunciationCandidate' : 'mismatch',
        expected,
        recognized,
        similarity
      });

      if (!isExact) {
        if (isMispronunciationCandidate) {
          mispronunciations.unshift({ expected: expected.text, recognized: recognized.text, similarity });
        } else {
          omissions.unshift({ expected: expected.text });
          additions.unshift({ recognized: recognized.text });
        }
      }

      i -= 1;
      j -= 1;
      continue;
    }

    if (i > 0 && (j === 0 || dir === 'up')) {
      const expected = scriptTokens[i - 1];
      alignedTokens.unshift({ type: 'omission', expected, recognized: null, similarity: 0 });
      omissions.unshift({ expected: expected.text });
      i -= 1;
      continue;
    }

    if (j > 0 && (i === 0 || dir === 'left')) {
      const recognized = transcriptTokens[j - 1];
      alignedTokens.unshift({ type: 'addition', expected: null, recognized, similarity: 0 });
      additions.unshift({ recognized: recognized.text });
      j -= 1;
      continue;
    }

    break;
  }

  const counts = {
    correct: alignedTokens.filter((item) => item.type === 'correct').length,
    addition: additions.length,
    omission: omissions.length,
    mispronunciationCandidate: mispronunciations.length
  };

  return {
    alignedTokens,
    scriptTokens,
    transcriptTokens,
    counts,
    additions,
    omissions,
    mispronunciations
  };
}

export function buildMistakeEntries(alignment) {
  const operations = Array.isArray(alignment?.alignedTokens) ? alignment.alignedTokens : [];
  return operations
    .filter((op) => op.type !== 'correct')
    .map((op) => ({
      id: `${op.type}-${op.expected?.start ?? op.recognized?.start ?? Math.random().toString(36).slice(2)}`,
      type: op.type,
      text: op.expected?.text || op.recognized?.text || '',
      scriptToken: op.expected?.text || '',
      transcriptToken: op.recognized?.text || '',
      label: op.type === 'omission' ? 'Bỏ sót từ' : op.type === 'addition' ? 'Addition' : 'Mispronunciation candidate'
    }));
}
