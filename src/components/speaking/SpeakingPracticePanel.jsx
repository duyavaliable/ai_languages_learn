import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Mic, MicOff, RefreshCw, Sparkles, X } from 'lucide-react';
import api from '../../services/api';
import { alignSpeakingTranscript, buildMistakeEntries, tokenizeSpeakingText } from '../../lib/speakingPractice';

// ─── Rephrase actions (tiếng Việt) ───────────────────────────────────────────
const ACTIONS = [
  { key: 'simplify', label: 'Đơn giản hóa' },
  { key: 'shorten', label: 'Rút gọn' },
  { key: 'rewrite', label: 'Viết lại' },
  { key: 'formalize', label: 'Trang trọng hơn' },
  { key: 'easier_to_pronounce', label: 'Dễ phát âm hơn' },
];

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function joinParts(parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SpeakingPracticePanel({ title, question, apiPrefix = '/ai' }) {
  // Refs
  const recognitionRef = useRef(null);
  const transcriptBoxRef = useRef(null);
  const liveEndRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const liveTranscriptRef = useRef('');
  const scriptSectionRef = useRef(null);

  // ── Script generation state ──
  const [modelScript, setModelScript] = useState('');
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState('');

  // ── Recording state ──
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [recognitionError, setRecognitionError] = useState('');

  // ── Assessment state ──
  const [assessment, setAssessment] = useState(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);

  // ── Rephrase popup state ──
  const [selectedMistake, setSelectedMistake] = useState(null);
  const [rephraseAction, setRephraseAction] = useState('rewrite');
  const [rephraseLoading, setRephraseLoading] = useState(false);
  const [rephraseError, setRephraseError] = useState('');
  const [rephraseAlternatives, setRephraseAlternatives] = useState([]);

  // ── Text selection popup state (script section) ──
  const [selectionPopup, setSelectionPopup] = useState(null); // { text, x, y }
  const [revisedTokens, setRevisedTokens] = useState({});

  const questionText = String(question || '').trim();

  // ── Generate model script on mount ────────────────────────────────────────
  useEffect(() => {
    if (!questionText) return;
    let cancelled = false;
    setScriptLoading(true);
    setScriptError('');
    api.post(`${apiPrefix}/speaking/generate-script`, { question: questionText })
      .then((res) => {
        if (!cancelled) setModelScript(String(res.data?.script || '').trim());
      })
      .catch((err) => {
        if (!cancelled) setScriptError(err?.response?.data?.message || err?.message || 'Không thể tạo script mẫu');
      })
      .finally(() => { if (!cancelled) setScriptLoading(false); });
    return () => { cancelled = true; };
  }, [questionText, apiPrefix]);

  // ── Speech Recognition setup ───────────────────────────────────────────────
  useEffect(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return undefined;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const finalParts = [];
      const interimParts = [];

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = String(result[0]?.transcript || '').trim();
        if (!text) continue;
        if (result.isFinal) finalParts.push(text);
        else interimParts.push(text);
      }

      const nextFinal = joinParts([finalTranscriptRef.current, ...finalParts]);
      const nextLive = joinParts([nextFinal, ...interimParts]);
      finalTranscriptRef.current = nextFinal;
      liveTranscriptRef.current = nextLive;
      setFinalTranscript(nextFinal);
      setLiveTranscript(nextLive);
    };

    recognition.onerror = (event) => {
      setRecognitionError(event?.error ? `Lỗi nhận giọng nói: ${event.error}` : 'Nhận giọng nói thất bại');
      setIsRecording(false);
    };

    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  // ── Auto-scroll live transcript ────────────────────────────────────────────
  useEffect(() => {
    liveEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [liveTranscript]);

  // ── Alignment (local, no Gemini) ───────────────────────────────────────────
  const alignment = useMemo(
    () => alignSpeakingTranscript(modelScript, liveTranscript),
    [modelScript, liveTranscript]
  );
  const mistakeEntries = useMemo(() => buildMistakeEntries(alignment), [alignment]);

  const tokenAlignmentMap = useMemo(() => {
    const map = new Map();
    alignment.alignedTokens.forEach((item, index) => {
      if (item.expected?.start !== undefined) map.set(`script-${item.expected.start}`, { ...item, index });
      if (item.recognized?.start !== undefined) map.set(`live-${item.recognized.start}`, { ...item, index });
    });
    return map;
  }, [alignment]);

  const liveTokens = useMemo(() => tokenizeSpeakingText(liveTranscript), [liveTranscript]);
  const scriptTokens = useMemo(() => tokenizeSpeakingText(modelScript), [modelScript]);

  // ── Recording toggle ───────────────────────────────────────────────────────
  const toggleRecording = async () => {
    setRecognitionError('');
    const recognition = recognitionRef.current;
    if (!recognition) {
      setRecognitionError('Trình duyệt chưa hỗ trợ Speech Recognition. Hãy dùng Chrome hoặc Edge.');
      return;
    }
    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
      return;
    }
    try {
      setAssessment(null);
      finalTranscriptRef.current = finalTranscript;
      liveTranscriptRef.current = liveTranscript;
      recognition.start();
      setIsRecording(true);
    } catch (err) {
      setRecognitionError(err?.message || 'Không thể bắt đầu nhận giọng nói');
    }
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetSession = () => {
    finalTranscriptRef.current = '';
    liveTranscriptRef.current = '';
    setLiveTranscript('');
    setFinalTranscript('');
    setAssessment(null);
    setSelectedMistake(null);
    setRephraseAlternatives([]);
    setRephraseError('');
    setRecognitionError('');
    setRevisedTokens({});
    setSelectionPopup(null);
  };

  // ── Open mistake from panel click ──────────────────────────────────────────
  const openMistake = (item) => {
    setSelectedMistake(item);
    setRephraseAction('rewrite');
    setRephraseAlternatives([]);
    setRephraseError('');
  };

  // ── Rephrase request ───────────────────────────────────────────────────────
  const requestRephrase = async (action) => {
    const targetText = selectionPopup?.text || selectedMistake?.text;
    if (!targetText) return;
    setRephraseLoading(true);
    setRephraseError('');
    setRephraseAction(action);
    try {
      const res = await api.post(`${apiPrefix}/speaking/rephrase`, {
        selectedText: targetText,
        originalScript: modelScript,
        action,
        context: modelScript,
      });
      setRephraseAlternatives(Array.isArray(res.data?.alternatives) ? res.data.alternatives : []);
    } catch (err) {
      setRephraseError(err?.response?.data?.message || err?.message || 'Không thể lấy gợi ý');
    } finally {
      setRephraseLoading(false);
    }
  };

  const applyRevision = (replacement) => {
    const key = selectedMistake?.id || (selectionPopup ? `sel-${selectionPopup.text}` : null);
    if (!key || !replacement) return;
    setRevisedTokens((prev) => ({ ...prev, [key]: replacement }));
    setSelectedMistake(null);
    setSelectionPopup(null);
    setRephraseAlternatives([]);
  };

  // ── Text selection in Script section ──────────────────────────────────────
  const handleScriptMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 2) {
      setSelectionPopup(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = scriptSectionRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setSelectionPopup({
      text,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
    });
    setRephraseAlternatives([]);
    setRephraseError('');
    setSelectedMistake(null);
  }, []);

  // ── Generate feedback ──────────────────────────────────────────────────────
  const generateFeedback = async () => {
    setAssessmentLoading(true);
    setRecognitionError('');
    try {
      const res = await api.post(`${apiPrefix}/speaking/assess`, {
        vstepQuestion: questionText,
        modelScript,
        finalTranscript: finalTranscript.trim(),
        detectedErrors: mistakeEntries,
        omissionCount: alignment.counts.omission,
        additionCount: alignment.counts.addition,
        mispronunciationCount: alignment.counts.mispronunciationCandidate,
      });
      setAssessment(res.data || null);
    } catch (err) {
      setRecognitionError(err?.response?.data?.message || err?.message || 'Không thể tạo phản hồi');
    } finally {
      setAssessmentLoading(false);
    }
  };

  // ── Render live transcript tokens (Your Script) ────────────────────────────
  const renderLiveTokens = () => {
    if (!liveTokens.length) {
      return (
        <span className="text-muted-foreground">
          {isRecording ? 'Đang nghe...' : 'Chưa có transcript.'}
        </span>
      );
    }
    return liveTokens.map((token) => {
      const aligned = tokenAlignmentMap.get(`live-${token.start}`);
      const type = aligned?.type;
      const tokenClass =
        type === 'correct'
          ? 'bg-emerald-500/15 text-emerald-700 border-emerald-400/30'
          : type === 'addition'
          ? 'bg-yellow-400/20 text-amber-800 border-yellow-400/50'
          : type === 'mispronunciationCandidate'
          ? 'bg-red-400/20 text-red-700 border-red-400/40 cursor-pointer'
          : 'bg-background border-border';

      return (
        <button
          key={`live-${token.start}-${token.text}`}
          type="button"
          onClick={() =>
            type && type !== 'correct' &&
            openMistake({
              id: `live-${token.start}`,
              type,
              text: token.text,
              scriptToken: aligned?.expected?.text || '',
              transcriptToken: token.text,
              label: type === 'addition' ? 'Thêm từ' : 'Có thể phát âm sai',
            })
          }
          className={`rounded-full border px-2.5 py-1 text-sm transition-smooth hover:scale-[1.01] ${tokenClass}`}
        >
          {token.text}
        </button>
      );
    });
  };

  // ── Render script tokens (model script with yellow highlight for errors) ───
  const renderScriptTokens = () => {
    if (scriptLoading) {
      return (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="h-6 animate-pulse rounded-full bg-muted"
              style={{ width: `${40 + (i % 5) * 20}px` }}
            />
          ))}
        </div>
      );
    }
    if (scriptError) {
      return <p className="text-sm text-destructive">{scriptError}</p>;
    }
    if (!modelScript) {
      return <p className="text-sm text-muted-foreground">Chưa có script mẫu.</p>;
    }

    // If no transcript yet — just show plain text
    if (!liveTranscript) {
      return (
        <p className="text-sm leading-8 text-foreground/90">
          {modelScript}
        </p>
      );
    }

    // Render token-by-token with yellow highlight for omission/mispronunciation only
    return (
      <div className="flex flex-wrap gap-x-1 gap-y-1.5">
        {scriptTokens.map((token) => {
          const aligned = tokenAlignmentMap.get(`script-${token.start}`);
          const type = aligned?.type;
          const isOmission = type === 'omission';
          const isMis = type === 'mispronunciationCandidate';
          const needsHighlight = isOmission || isMis;

          if (!needsHighlight) {
            return (
              <span
                key={`script-${token.start}`}
                className="text-sm leading-8 text-foreground/90"
              >
                {token.text}{' '}
              </span>
            );
          }

          return (
            <button
              key={`script-${token.start}`}
              type="button"
              title={isOmission ? 'Bỏ sót từ này' : 'Có thể phát âm sai'}
              onClick={() =>
                openMistake({
                  id: `script-${token.start}`,
                  type: isOmission ? 'omission' : 'mispronunciationCandidate',
                  text: token.text,
                  scriptToken: token.text,
                  transcriptToken: aligned?.recognized?.text || '',
                  label: isOmission ? 'Bỏ sót từ' : 'Có thể phát âm sai',
                })
              }
              className="rounded-sm bg-yellow-300/40 px-0.5 text-sm leading-8 text-amber-900 underline decoration-yellow-500/60 decoration-dashed underline-offset-2 transition-smooth hover:bg-yellow-300/70"
            >
              {token.text}
            </button>
          );
        })}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-border bg-card shadow-card">
        {/* Header */}
        <div className="border-b border-border bg-secondary/40 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Speaking Practice
          </p>
          <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{title || 'Speaking Practice'}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            AI sẽ tạo đoạn nói mẫu từ đề bài. Luyện đọc, so khớp thời gian thực, nhận phản hồi thông minh.
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">

            {/* ── 1. ĐỀ BÀI ──────────────────────────────────────────────── */}
            <div className="rounded-[28px] border border-border bg-background p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Đề bài
              </p>
              <p className="mt-3 text-sm leading-7 text-foreground/90 whitespace-pre-wrap">
                {questionText || <span className="text-muted-foreground">Chưa có đề bài.</span>}
              </p>
            </div>

            {/* ── 2. YOUR SCRIPT (Live Transcript) ───────────────────────── */}
            <div className="rounded-[28px] border border-border bg-background p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Your Script
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isRecording ? 'Đang lắng nghe...' : 'Nhấn mic để bắt đầu đọc.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-elegant transition-smooth ${
                    isRecording
                      ? 'bg-destructive text-white'
                      : 'gradient-primary text-primary-foreground'
                  }`}
                >
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {isRecording ? 'Dừng' : 'Mic'}
                </button>
              </div>

              <div
                ref={transcriptBoxRef}
                className="mt-4 max-h-52 min-h-[80px] overflow-y-auto rounded-2xl border border-border bg-secondary/30 p-4"
              >
                <div className="flex flex-wrap gap-1.5">
                  {renderLiveTokens()}
                  <span ref={liveEndRef} />
                </div>
              </div>

              {recognitionError && (
                <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {recognitionError}
                </div>
              )}

              {/* Stat strip */}
              {liveTranscript && (
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    Đúng: {alignment.counts.correct}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
                    Thêm từ: {alignment.counts.addition}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                    Phát âm sai: {alignment.counts.mispronunciationCandidate}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                    Bỏ sót: {alignment.counts.omission}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={generateFeedback}
                  disabled={assessmentLoading || !modelScript || !finalTranscript.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-smooth hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {assessmentLoading
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    : <Sparkles className="h-4 w-4" />}
                  Tạo phản hồi
                </button>
                <button
                  type="button"
                  onClick={resetSession}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-smooth hover:border-primary hover:text-primary"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset
                </button>
                <div className="text-xs text-muted-foreground">
                  Độ dài transcript: {finalTranscript.length}
                </div>
              </div>
            </div>

            {/* ── 3. SCRIPT (Model Answer) ────────────────────────────────── */}
            <div
              ref={scriptSectionRef}
              className="relative rounded-[28px] border border-border bg-background p-5"
              onMouseUp={handleScriptMouseUp}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Script
                </p>
                {scriptLoading && (
                  <span className="text-xs text-muted-foreground animate-pulse">
                    AI đang tạo script...
                  </span>
                )}
              </div>
              <div className="mt-3">{renderScriptTokens()}</div>

              {/* Text selection popup */}
              {selectionPopup && (
                <div
                  className="absolute z-20 -translate-x-1/2 -translate-y-full"
                  style={{ left: selectionPopup.x, top: selectionPopup.y }}
                >
                  <div className="rounded-2xl border border-border bg-card p-2 shadow-elegant">
                    <p className="mb-2 truncate px-1 text-xs text-muted-foreground max-w-[200px]">
                      "{selectionPopup.text}"
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {ACTIONS.map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => {
                            setSelectedMistake({
                              id: `sel-${selectionPopup.text}`,
                              text: selectionPopup.text,
                              label: a.label,
                            });
                            setSelectionPopup(null);
                            requestRephrase(a.key);
                          }}
                          className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium transition-smooth hover:border-primary hover:text-primary"
                        >
                          {a.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectionPopup(null)}
                        className="rounded-full border border-border bg-background p-1 transition-smooth hover:border-destructive hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── 4. AI FEEDBACK ──────────────────────────────────────────── */}
            {assessment && (
              <div className="rounded-[28px] border border-border bg-background p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-success">
                  <BadgeCheck className="h-4 w-4" />
                  Phản hồi AI
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <AssessmentBlock title="Điểm mạnh" items={assessment.strengths} />
                  <AssessmentBlock title="Từ thường bỏ sót" items={assessment.frequentlyMissedWords} />
                  <AssessmentBlock title="Từ khó phát âm" items={assessment.difficultVocabulary} />
                  <AssessmentBlock title="Lỗi phổ biến" items={assessment.commonMistakes} />
                  <AssessmentBlock title="Gợi ý cải thiện" items={assessment.improvementSuggestions} className="sm:col-span-2" />
                </div>
                {assessment.overallAssessment && (
                  <div className="mt-4 rounded-2xl border border-border bg-secondary/30 p-4 text-sm leading-7 text-foreground/85">
                    {assessment.overallAssessment}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── SIDEBAR: Mistakes Panel ──────────────────────────────────── */}
          <aside className="space-y-4">
            <div className="rounded-[28px] border border-border bg-card p-5 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Lỗi phát hiện
              </p>
              <div className="mt-3 space-y-2">
                {mistakeEntries.length > 0 ? (
                  mistakeEntries.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openMistake(item)}
                      className="flex w-full items-center justify-between rounded-2xl border border-border bg-background px-3 py-2 text-left text-sm transition-smooth hover:border-primary"
                    >
                      <span>
                        <span className="font-semibold">{item.label}:</span>{' '}
                        <span className="text-foreground/80">{item.text}</span>
                      </span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">Sửa</span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {liveTranscript
                      ? 'Không phát hiện lỗi nào. Tốt lắm!'
                      : 'Chưa có lỗi nào được phát hiện.'}
                  </p>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="rounded-[28px] border border-border bg-card p-5 shadow-card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Chú thích màu
              </p>
              <div className="space-y-2 text-xs">
                <LegendItem color="bg-emerald-500" label="Your Script — Đúng" />
                <LegendItem color="bg-yellow-400" label="Your Script — Thêm từ" />
                <LegendItem color="bg-red-400" label="Your Script — Có thể phát âm sai" />
                <LegendItem color="bg-yellow-300" label="Script — Bỏ sót / Sai từ" border />
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Rephrase Modal ───────────────────────────────────────────────────── */}
      {selectedMistake && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-[28px] border border-border bg-card p-5 shadow-elegant">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Hỗ trợ diễn đạt lại
                </p>
                <h3 className="mt-1 text-xl font-bold">{selectedMistake.label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selectedMistake.text || selectedMistake.scriptToken || selectedMistake.transcriptToken}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedMistake(null); setRephraseAlternatives([]); }}
                className="rounded-full border border-border bg-background p-2 transition-smooth hover:border-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {ACTIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => requestRephrase(a.key)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition-smooth ${
                    rephraseAction === a.key
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-background hover:border-primary hover:text-primary'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {rephraseLoading && (
              <div className="mt-4 text-sm text-muted-foreground animate-pulse">Đang lấy gợi ý từ Gemini...</div>
            )}
            {rephraseError && (
              <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {rephraseError}
              </div>
            )}
            {rephraseAlternatives.length > 0 && (
              <div className="mt-4 space-y-2">
                {rephraseAlternatives.map((alt, i) => (
                  <button
                    key={`${i}-${alt}`}
                    type="button"
                    onClick={() => applyRevision(alt)}
                    className="w-full rounded-2xl border border-border bg-background p-3 text-left text-sm transition-smooth hover:border-primary hover:bg-primary/5"
                  >
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Phương án {i + 1}
                    </div>
                    <div className="mt-1">{alt}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────
function AssessmentBlock({ title, items, className = '' }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <div className={`rounded-2xl border border-border bg-secondary/25 p-4 ${className}`}>
      <div className="text-sm font-semibold">{title}</div>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-muted-foreground">
        {list.length > 0
          ? list.map((item, i) => <li key={`${title}-${i}`}>• {String(item)}</li>)
          : <li>• Không có</li>}
      </ul>
    </div>
  );
}

function LegendItem({ color, label, border }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className={`inline-block h-3 w-3 rounded-sm ${color} ${border ? 'border border-yellow-500/50' : ''}`} />
      <span>{label}</span>
    </div>
  );
}
