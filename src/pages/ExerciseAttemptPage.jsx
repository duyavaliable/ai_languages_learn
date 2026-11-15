import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Pause, Play, SkipBack, SkipForward, Speaker, X } from 'lucide-react';
import api from '../services/api';
import { renderMarked } from '../lib/renderMarked';
import { assetUrl } from '../lib/asset';
import { SectionHeading, PassageBlock, QuestionImages, isLabelOnly } from '../components/ExamBlocks';
import { HighlightedEssay, WritingFeedback } from '../components/WritingFeedback';

function parseQuestions(questionsJson) {
  if (Array.isArray(questionsJson)) return questionsJson;
  try {
    return JSON.parse(questionsJson || '[]');
  } catch {
    return [];
  }
}

function extractWritingPromptFromQuestions(questionsJson) {
  const parsed = parseQuestions(questionsJson);
  if (!Array.isArray(parsed) || parsed.length === 0) return '';
  const first = parsed[0] || {};
  if (typeof first?.prompt === 'string' && first.prompt.trim()) return first.prompt.trim();
  if (typeof first?.question === 'string' && first.question.trim()) return first.question.trim();
  return '';
}

// Hai dạng đề Viết VSTEP. Số từ tối thiểu theo quy chế (Task 1 ≥ 120,
// Task 2 ≥ 250); số từ mục tiêu là mức nên viết để không bị thiếu ý.
const VSTEP_WRITING_TASKS = {
  1: {
    label: 'Task 1 — Viết thư / email',
    minWords: 120,
    targetWords: 150,
    tips: [
      'Mở thư: lời chào (Dear …,) và một câu cảm ơn / hỏi thăm.',
      'Thân thư: trả lời LẦN LƯỢT từng câu hỏi trong đề, mỗi ý một đoạn ngắn.',
      'Kết thư: một câu tóm ý, lời hẹn hoặc mong hồi âm.',
      'Ký tên: Best wishes / Love, + tên. Giọng thân mật nếu viết cho bạn.',
    ],
  },
  2: {
    label: 'Task 2 — Viết luận',
    minWords: 250,
    targetWords: 280,
    tips: [
      'Mở bài: diễn đạt lại đề và nêu rõ quan điểm của bạn.',
      'Thân bài 1: lý do chính thứ nhất, kèm giải thích và ví dụ.',
      'Thân bài 2: lý do thứ hai, hoặc nêu ý phản biện rồi bác bỏ.',
      'Kết bài: khẳng định lại quan điểm, không thêm ý mới.',
    ],
  },
};

// Dạng m:ss (0:00, 0:11, 6:27). Làm tròn xuống về giây nguyên: thời gian
// của thẻ <audio> là số thực (11.643334...), trước đây không làm tròn nên
// in ra "00:11.643334".
function formatTime(totalSeconds) {
  const total = Math.floor(Math.max(0, Number(totalSeconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function extractIntroText(fullText) {
  const source = String(fullText || '').trim();
  if (!source) return '';
  const firstQuestionIndex = source.search(/(?:^|\n)\s*\d+\s*[\.)]\s+/m);
  return (firstQuestionIndex >= 0 ? source.slice(0, firstQuestionIndex) : source).trim();
}

function resolveCorrectAnswerText(question) {
  const direct = String(question?.correctAnswer || '').trim();
  if (!direct) return '';
  if (/^[A-D]$/i.test(direct)) {
    const index = direct.toUpperCase().charCodeAt(0) - 65;
    return String(question?.options?.[index]?.value || question?.options?.[index] || '').trim();
  }
  return direct;
}

function getQuestionText(question) {
  return String(question?.question || question?.text || '').trim();
}

function getOptionValue(option) {
  if (typeof option === 'string') return option;
  return String(option?.value ?? option?.text ?? '').trim();
}

function normalizeOptions(question) {
  const rawOptions = Array.isArray(question?.options) ? question.options : [];
  return rawOptions.map((option, index) => ({
    label: typeof option === 'string' ? String.fromCharCode(65 + index) : String(option?.label || String.fromCharCode(65 + index)),
    value: getOptionValue(option),
  }));
}

function ExerciseAttemptPage() {
  const navigate = useNavigate();
  // Duong dan khong con mang `courseId`/`skill`: ky nang lay thang tu ban ghi
  // bai tap (xem `displaySkill` ben duoi), con khoa hoc thi nguoi hoc chua bao
  // gio chon.
  const { exerciseId } = useParams();
  const audioRef = useRef(null);
  const questionRefs = useRef([]);

  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [textResponse, setTextResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Chấm bài viết cơ bản (LanguageTool + chỉ số), không dùng AI.
  const [writingResult, setWritingResult] = useState(null);
  const [writingChecking, setWritingChecking] = useState(false);
  const [writingCheckError, setWritingCheckError] = useState('');
  const [activeIssue, setActiveIssue] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrent, setAudioCurrent] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioError, setAudioError] = useState('');

  // Lùi một bước để về đúng ngôn ngữ / kỹ năng đã chọn ở trang chủ. Mở thẳng
  // bằng link (không có bước nào để lùi) thì về trang chủ — trang chủ tự đọc
  // lại lựa chọn cuối trong sessionStorage.
  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/');
  };

  useEffect(() => {
    api.get(`/exercises/${exerciseId}`)
      .then((res) => {
        const data = res.data || {};
        setExercise(data);
        const questions = parseQuestions(data?.questions_json || data?.questions || []);
        const questionCount = Array.isArray(questions) ? questions.length : 0;
        setSecondsLeft(Number(data?.time_limit_sec) || Math.max(questionCount * 90, 300));
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || 'Không tải được bài tập');
        setLoading(false);
      });
  }, [exerciseId]);

  useEffect(() => {
    if (submitted || loading || secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setSubmitted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [submitted, loading, secondsLeft]);

  const questions = useMemo(() => parseQuestions(exercise?.questions_json || exercise?.questions || []), [exercise]);
  const writingPromptFromQuestions = useMemo(
    () => extractWritingPromptFromQuestions(exercise?.questions_json || exercise?.questions || []),
    [exercise]
  );
  const readingPassage = String(exercise?.reading_passage || '').trim();
  const readingPassageDisplay = useMemo(() => extractIntroText(readingPassage), [readingPassage]);
  const hasSharedPassage = Boolean(readingPassageDisplay || readingPassage);
  const taskPrompt = String(exercise?.task_prompt || exercise?.taskPrompt || writingPromptFromQuestions || exercise?.prompt || exercise?.reading_passage || '').trim();
  const audioUrl = String(exercise?.audio_url || '').trim();
  // đề nghe quét từ PDF có thể có file nghe riêng cho từng câu / từng mục (`question.audio`)
  const hasQuestionAudio = questions.some((q) => q?.audio);
  const displayTitle = exercise?.title || 'Bài tập';
  const isReadingLike = ['reading', 'vocabulary', 'grammar'].includes(String(exercise?.skill_type || '').toLowerCase());
  const isReading = isReadingLike;
  const isListening = exercise?.skill_type === 'listening';
  const isWriting = exercise?.skill_type === 'writing';
  const isSpeaking = exercise?.skill_type === 'speaking';

  // Bài NÓI chỉ có một dạng: bài đọc (văn bản cho trước), chấm phát âm bằng model của đồ án ở trang riêng.
  // (Giao diện "nói tự do" cũ — ghi âm rồi gửi Gemini chấm — đã gỡ.) Mở nhầm link /exercises/<id>
  // của bài nói thì chuyển sang đúng trang.
  useEffect(() => {
    if (isSpeaking) navigate(`/speaking/${exerciseId}`, { replace: true });
  }, [isSpeaking, exerciseId, navigate]);

  // Thẻ <audio> chỉ có trong DOM SAU khi tải xong bài (lúc đầu đang hiện
  // "Đang tải..."). Trước đây effect chỉ phụ thuộc `playbackRate` nên chạy
  // đúng một lần khi `audioRef` còn null -> không gắn được listener nào:
  // thanh tiến độ đứng yên, nghe hết không đổi lại nút Play, file lỗi cũng
  // không ai biết. Phải chạy lại khi bài tải xong / đổi file.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const syncState = () => {
      setAudioCurrent(audio.currentTime || 0);
      setAudioProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
      if (Number.isFinite(audio.duration)) setAudioDuration(audio.duration);
    };

    const onEnded = () => setIsPlaying(false);
    // File không tồn tại thì server trả trang HTML / 404 -> trình duyệt báo
    // lỗi giải mã. Hiện lỗi ra thay vì để trình phát im lặng.
    const onError = () => {
      setIsPlaying(false);
      setAudioError('Không tải được file nghe. File có thể đã bị xoá khỏi máy chủ — hãy báo giáo viên tải lại.');
    };

    setAudioError('');
    audio.playbackRate = playbackRate;
    audio.addEventListener('timeupdate', syncState);
    audio.addEventListener('loadedmetadata', syncState);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    // Lỗi có thể đã xảy ra TRƯỚC khi gắn listener (preload chạy ngay khi
    // thẻ vào DOM).
    if (audio.error) onError();

    return () => {
      audio.removeEventListener('timeupdate', syncState);
      audio.removeEventListener('loadedmetadata', syncState);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [playbackRate, loading, isListening, audioUrl]);

  const wordCount = useMemo(() => {
    const trimmed = textResponse.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [textResponse]);

  // Dạng đề VSTEP (1 = thư, 2 = luận) ghi trong `questions_json[0].vstep_task`.
  // Bài cũ không có trường này: dùng gợi ý dạng luận, không chặn số từ.
  const writingTask = VSTEP_WRITING_TASKS[Number(questions[0]?.vstep_task)] || null;
  const writingMinWords = Number(questions[0]?.min_words || writingTask?.minWords || 0);
  const writingTargetWords = writingTask?.targetWords || 250;
  const writingTips = (writingTask || VSTEP_WRITING_TASKS[2]).tips;
  const writingProgress = Math.min(100, writingTargetWords > 0 ? (wordCount / writingTargetWords) * 100 : 0);
  // Bài mẫu lấy từ CSDL (`exercises.sample_answer`), chỉ hiện sau khi nộp.
  const writingSampleAnswer = String(exercise?.sample_answer || '').trim();

  useEffect(() => {
    if (!isWriting || !exercise) return;
    if (!taskPrompt) {
      console.error('[ExerciseAttemptPage] writing prompt missing', {
        exerciseId,
        skillType: exercise?.skill_type,
        title: exercise?.title,
        task_prompt: exercise?.task_prompt,
        taskPromptCamel: exercise?.taskPrompt,
        reading_passage: exercise?.reading_passage,
        prompt: exercise?.prompt
      });
    } else {
      console.log('[ExerciseAttemptPage] writing prompt loaded', {
        exerciseId,
        promptLength: taskPrompt.length
      });
    }
  }, [isWriting, exercise, taskPrompt, exerciseId]);

  const score = useMemo(() => {
    if (!submitted || questions.length === 0 || isWriting) return 0;
    return questions.reduce((acc, question, index) => {
      const selected = answers[`q-${index}`];
      const correctAnswerText = resolveCorrectAnswerText(question);
      return selected && selected === correctAnswerText ? acc + 1 : acc;
    }, 0);
  }, [submitted, questions, answers, isWriting]);

  const displaySkill = String(exercise?.skill_type || '').toLowerCase();
  const hasQuestions = questions.length > 0;

  const checkWriting = async () => {
    if (!textResponse.trim()) return;
    setWritingChecking(true);
    setWritingCheckError('');
    try {
      const { data } = await api.post('/writing/check', {
        text: textResponse,
        prompt: taskPrompt,
        minWords: writingMinWords
      }, { timeout: 60000 });
      setWritingResult(data);
      setActiveIssue(null);
    } catch (err) {
      setWritingCheckError(err.response?.data?.message || 'Không chấm được bài viết. Thử lại sau.');
    } finally {
      setWritingChecking(false);
    }
  };

  // Chấm ngay khi bài viết được nộp — bấm "Nộp bài" hoặc hết giờ.
  useEffect(() => {
    if (isWriting && submitted && !writingResult && !writingChecking && !writingCheckError) {
      checkWriting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, submitted]);

  const handleSubmit = () => {
    setSubmitted(true);
    const audio = audioRef.current;
    if (audio) audio.pause();
    setIsPlaying(false);
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // `play()` trả Promise; bị từ chối (file hỏng, không có nguồn) thì
      // trước đây vẫn đổi nút sang Pause như đang phát.
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          setAudioError('Không phát được file nghe này.');
        });
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const seekAudio = (nextTime) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(nextTime, audio.duration || nextTime));
    setAudioCurrent(audio.currentTime || 0);
    setAudioProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
  };

  const cycleRate = () => {
    const next = playbackRate === 1 ? 1.25 : playbackRate === 1.25 ? 1.5 : playbackRate === 1.5 ? 0.75 : 1;
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const goToQuestion = (index) => {
    setCurrentQuestion(index);
    questionRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Khoá theo VỊ TRÍ câu, không theo số câu: đề nhiều mục đánh số lại từ 1 ở mỗi mục
  // (JLPT もんだい1..4 đều có câu 1), khoá theo số câu làm chọn một câu thành chọn cả bốn.
  const getQuestionKey = (_question, index) => `q-${index}`;

  const selectAnswer = (questionKey, value) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-card/90 backdrop-blur-xl shadow-sticky">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button onClick={goBack} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-semibold transition-smooth hover:border-primary hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </button>
          <div className="min-w-0 text-center">
            <h1 className="truncate text-base font-semibold sm:text-lg">{displayTitle}</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Kỹ năng: <span className="font-semibold uppercase text-foreground">{displaySkill}</span>
              <span className="mx-2">•</span>
              {submitted ? (isWriting ? `Đã nộp | ${wordCount} từ` : `Submitted | ${score}/${questions.length}`) : `Còn lại ${formatTime(secondsLeft)}`}
            </p>
          </div>
          <button onClick={goBack} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-smooth hover:border-primary hover:text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {loading && <p className="py-16 text-center text-sm text-muted-foreground">Đang tải...</p>}
        {error && <p className="py-16 text-center text-sm text-destructive">{error}</p>}

        {!loading && !error && isReading && (
          // Có đoạn đọc chung (`reading_passage`) -> hai cột: đoạn văn trái,
          // câu hỏi phải. Không có (đề từ vựng / ngữ pháp, hoặc mỗi câu một
          // đoạn riêng) -> một cột, đoạn văn và ảnh hiện ngay trên câu hỏi.
          <div className={hasSharedPassage ? 'grid gap-6 xl:grid-cols-[1.05fr_0.95fr]' : 'mx-auto max-w-3xl'}>
            {hasSharedPassage && (
              <section className="overflow-hidden rounded-[32px] border border-border bg-card shadow-card">
                <div className="border-b border-border bg-secondary/40 p-5 sm:p-6">
                  <div className="grid gap-5 md:grid-cols-[0.85fr_1.15fr] md:items-center">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Reading passage</p>
                      <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{exercise?.reading_title || exercise?.title || 'Bài đọc'}</h2>
                    </div>
                  </div>
                </div>
                <div className="custom-scrollbar max-h-[calc(100vh-220px)] overflow-y-auto p-6 sm:p-7">
                  <div className="prose prose-slate max-w-none">
                    {(readingPassageDisplay || readingPassage).split('\n\n').map((paragraph, index) => (
                      <p key={index} className="mb-4 whitespace-pre-line text-sm leading-7 text-foreground/85">
                        {renderMarked(paragraph)}
                      </p>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section className="space-y-4">
              <div className={`space-y-4 ${hasSharedPassage ? 'custom-scrollbar overflow-y-auto pr-1 xl:max-h-[calc(100vh-260px)]' : ''}`}>
                {questions.map((question, index) => {
                  const questionKey = getQuestionKey(question, index);
                  const selectedAnswer = answers[questionKey];
                  const correctAnswerText = resolveCorrectAnswerText(question);
                  const isCorrect = submitted && selectedAnswer === correctAnswerText;
                  const isWrong = submitted && selectedAnswer && selectedAnswer !== correctAnswerText;
                  // Tiêu đề 問題 và đoạn văn chỉ hiện ở câu ĐẦU của nhóm.
                  const prev = questions[index - 1];
                  const showSection = question.section && question.section !== prev?.section;
                  const showPassage = question.passage && question.passage !== prev?.passage;

                  return (
                    <div key={`${question.section}-${question.id}-${index}`} className="space-y-4">
                      {showSection && <SectionHeading question={question} first={index === 0} />}
                      {showPassage && <PassageBlock question={question} />}
                      <article
                        ref={(el) => {
                          questionRefs.current[index] = el;
                        }}
                        className={`rounded-[24px] border bg-card p-5 shadow-card transition-smooth ${index === currentQuestion && !submitted ? 'border-primary shadow-elegant' : 'border-border'} ${isCorrect ? 'border-success bg-success/5' : ''} ${isWrong ? 'border-destructive bg-destructive/5' : ''}`}
                      >
                        <div className="mb-4 flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-primary text-sm font-bold text-primary-foreground">{question.id || index + 1}</div>
                          <h3 className="whitespace-pre-line pt-1 text-sm font-medium leading-6">{renderMarked(getQuestionText(question))}</h3>
                        </div>

                        {/* Ảnh cắt từ đề (hình minh hoạ, hoặc ảnh gốc cả câu ở đề PDF quét). */}
                        <QuestionImages question={question} number={question.id || index + 1} />

                        <div className={`grid gap-2 ${isLabelOnly(normalizeOptions(question)) ? 'grid-cols-4' : 'sm:grid-cols-2'}`}>
                          {normalizeOptions(question).map((option, optionIndex, all) => {
                            const isSelected = selectedAnswer === option.value;
                            const isOptionCorrect = submitted && correctAnswerText === option.value;
                            const isOptionWrong = submitted && isSelected && !isOptionCorrect;
                            const only = isLabelOnly(all);

                            return (
                              <button
                                key={`${question.id || index}-${optionIndex}`}
                                onClick={() => selectAnswer(questionKey, option.value)}
                                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-smooth ${only ? 'justify-center' : ''} ${!submitted && isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/80'} ${isOptionCorrect ? 'border-success bg-success/10' : ''} ${isOptionWrong ? 'border-destructive bg-destructive/10' : ''}`}
                                disabled={submitted}
                              >
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${!submitted && isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'} ${isOptionCorrect ? 'border-success bg-success text-success-foreground' : ''} ${isOptionWrong ? 'border-destructive bg-destructive text-destructive-foreground' : ''}`}>
                                  {isOptionCorrect && <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {isOptionWrong ? '!' : option.label}
                                </span>
                                {!only && <span className="leading-6 text-foreground">{renderMarked(option.value)}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {!loading && !error && isListening && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[32px] border border-border bg-card shadow-card">
              <div className="grid gap-5 border-b border-border bg-secondary/40 p-5 sm:p-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Listening player</p>
                      <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{exercise?.audio_title || exercise?.title || 'Bài nghe'}</h2>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-5 p-5 sm:p-6">
                <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" />
                {!audioUrl && hasQuestionAudio ? (
                  // Đề có file nghe riêng cho từng câu / từng mục: phát ngay tại câu đó.
                  <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-foreground/85">
                    Mỗi câu (hoặc mỗi mục) có file nghe riêng — bấm phát ở ngay câu đó bên dưới.
                  </div>
                ) : (
                <>
                {(audioError || !audioUrl) && (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    {audioError || 'Bài nghe này chưa có file âm thanh.'}
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="w-11 text-right font-mono">{formatTime(audioCurrent)}</span>
                  <div className="relative flex-1">
                    <div className="h-2 w-full rounded-full bg-secondary">
                      <div className="h-2 rounded-full gradient-primary transition-smooth" style={{ width: `${audioProgress}%` }} />
                    </div>
                  </div>
                  <span className="w-11 font-mono">{formatTime(audioDuration || exercise?.audio_duration || 0)}</span>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button onClick={cycleRate} className="rounded-full border border-border bg-background px-3 py-2 text-sm font-semibold transition-smooth hover:border-primary hover:text-primary">{playbackRate}x</button>
                  <button onClick={() => seekAudio(audioCurrent - 10)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background transition-smooth hover:border-primary hover:text-primary">
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <button onClick={handlePlayPause} className="inline-flex h-14 w-14 items-center justify-center rounded-full gradient-primary text-primary-foreground shadow-elegant transition-smooth hover:shadow-glow">
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                  </button>
                  <button onClick={() => seekAudio(audioCurrent + 10)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background transition-smooth hover:border-primary hover:text-primary">
                    <SkipForward className="h-4 w-4" />
                  </button>
                  <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background transition-smooth hover:border-primary hover:text-primary">
                    <Speaker className="h-4 w-4" />
                  </button>
                </div>
                </>
                )}
                {taskPrompt && (
                  <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm leading-6 text-foreground/85">
                    {taskPrompt}
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              {questions.map((question, index) => {
                const questionKey = getQuestionKey(question, index);
                const selectedAnswer = answers[questionKey];
                const correctAnswerText = resolveCorrectAnswerText(question);
                const isCorrect = submitted && selectedAnswer === correctAnswerText;
                const isWrong = submitted && selectedAnswer && selectedAnswer !== correctAnswerText;
                // Đề có chia phần / nhóm (PART 2, "Conversation 1 ..."): tiêu đề và mô tả
                // chỉ hiện ở câu ĐẦU của nhóm, giống bài đọc.
                const prev = questions[index - 1];
                const showSection = question.section && question.section !== prev?.section;
                const showPassage = question.passage && question.passage !== prev?.passage;

                return (
                  <div key={`${question.section}-${question.id}-${index}`} className="space-y-4">
                  {showSection && <SectionHeading question={question} first={index === 0} />}
                  {showPassage && <PassageBlock question={question} />}
                  {/* file nghe riêng: hiện một lần cho cả nhóm câu dùng chung file (vd mỗi mục một file) */}
                  {question.audio && question.audio !== prev?.audio && (
                    <audio controls preload="none" src={assetUrl(question.audio)} className="w-full" />
                  )}
                  <article
                    ref={(el) => {
                      questionRefs.current[index] = el;
                    }}
                    className={`rounded-[24px] border bg-card p-5 shadow-card transition-smooth ${index === currentQuestion && !submitted ? 'border-primary shadow-elegant' : 'border-border'} ${isCorrect ? 'border-success bg-success/5' : ''} ${isWrong ? 'border-destructive bg-destructive/5' : ''}`}
                  >
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-primary text-sm font-bold text-primary-foreground">{question.id || index + 1}</div>
                      <h3 className="whitespace-pre-line pt-1 text-sm font-medium leading-6">
                        {getQuestionText(question)
                          ? renderMarked(getQuestionText(question))
                          : question.display === 'audio' && <span className="text-muted-foreground">Câu này không in trong đề: nghe rồi chọn đáp án.</span>}
                      </h3>
                    </div>

                    {/* Đề quét: câu có tranh hiện đúng tranh gốc của đề. */}
                    <QuestionImages question={question} number={question.id || index + 1} />

                    <div className={`grid gap-2 ${isLabelOnly(normalizeOptions(question)) ? 'grid-cols-4' : 'sm:grid-cols-2'}`}>
                      {normalizeOptions(question).map((option, optionIndex, all) => {
                        const isSelected = selectedAnswer === option.value;
                        const isOptionCorrect = submitted && correctAnswerText === option.value;
                        const isOptionWrong = submitted && isSelected && !isOptionCorrect;
                        const only = isLabelOnly(all);

                        return (
                          <button
                            key={`${question.id || index}-${optionIndex}`}
                            onClick={() => selectAnswer(questionKey, option.value)}
                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-smooth ${only ? 'justify-center' : ''} ${!submitted && isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/80'} ${isOptionCorrect ? 'border-success bg-success/10' : ''} ${isOptionWrong ? 'border-destructive bg-destructive/10' : ''}`}
                            disabled={submitted}
                          >
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${!submitted && isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'} ${isOptionCorrect ? 'border-success bg-success text-success-foreground' : ''} ${isOptionWrong ? 'border-destructive bg-destructive text-destructive-foreground' : ''}`}>
                              {isOptionCorrect && <CheckCircle2 className="h-3.5 w-3.5" />}
                              {isOptionWrong ? '!' : option.label}
                            </span>
                            {!only && <span className="leading-6 text-foreground">{renderMarked(option.value)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                  </div>
                );
              })}
            </section>
          </div>
        )}

        {!loading && !error && isWriting && (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="overflow-hidden rounded-[32px] border border-border bg-card shadow-card">
              <div className="grid gap-5 border-b border-border bg-secondary/40 p-5 sm:p-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{writingTask?.label || 'Writing task'}</p>
                  <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{exercise?.title || 'Writing task'}</h2>
                </div>
              </div>
              <div className="space-y-5 p-5 sm:p-6">
                <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                  <div className="mb-2 text-sm font-semibold text-foreground">Đề bài</div>
                  <p className="whitespace-pre-line text-sm leading-7 text-foreground/85">{taskPrompt || 'Chưa có đề bài.'}</p>
                </div>
                {writingResult ? (
                  <HighlightedEssay
                    text={textResponse}
                    issues={writingResult.issues}
                    active={activeIssue}
                    onSelect={setActiveIssue}
                  />
                ) : (
                  <textarea
                    value={textResponse}
                    onChange={(e) => setTextResponse(e.target.value)}
                    placeholder="Start writing your essay here..."
                    className="min-h-[420px] w-full resize-none rounded-3xl border border-border bg-background p-5 text-sm leading-7 outline-none transition-smooth focus:border-primary focus:ring-2 focus:ring-primary/10"
                    disabled={submitted}
                    spellCheck
                  />
                )}
                <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                  <span>{wordCount} từ</span>
                  <span>
                    {writingMinWords > 0 ? `Tối thiểu: ${writingMinWords} · ` : ''}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div className={`h-2 rounded-full transition-smooth ${wordCount >= writingMinWords ? 'gradient-success' : 'gradient-primary'}`} style={{ width: `${writingProgress}%` }} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button onClick={handleSubmit} disabled={submitted || (writingMinWords > 0 && wordCount < writingMinWords)}className="rounded-full gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant transition-smooth hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50">
                    {submitted ? 'Đã nộp' : 'Nộp bài'}
                  </button>
                  {submitted && writingChecking && (
                    <span className="text-sm text-muted-foreground">Đang chấm bài viết…</span>
                  )}
                  {submitted && writingCheckError && (
                    <span className="flex items-center gap-2 text-sm text-red-600">
                      {writingCheckError}
                      <button type="button" onClick={checkWriting} className="font-semibold underline">Thử lại</button>
                    </span>
                  )}
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              {writingResult && (
                <WritingFeedback result={writingResult} active={activeIssue} onSelect={setActiveIssue} />
              )}
              <div className="rounded-[28px] border border-border bg-card p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Support panel</p>
                <h3 className="mt-1 text-xl font-bold">Writing support</h3>
              </div>

              <div className="rounded-[24px] border border-border bg-card p-5 shadow-card">
                <div className="mb-3 text-sm font-semibold">Structure</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {writingTips.map((item) => (
                    <div key={item} className="rounded-2xl border border-border bg-secondary/35 px-3 py-2 leading-6">{item}</div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-border bg-card p-5 shadow-card">
                <div className="mb-3 text-sm font-semibold">Sample answer</div>
                <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                  {!submitted
                    ? 'Nộp bài để xem bài mẫu.'
                    : (writingSampleAnswer || 'Chưa có bài mẫu cho bài viết này.')}
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>



      {!loading && !error && hasQuestions && !isWriting && !isSpeaking && (
        <footer className="sticky bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl shadow-sticky">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-2">
              {questions.map((question, index) => (
                <button
                  key={question.id || index}
                  onClick={() => goToQuestion(index)}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-semibold transition-smooth ${index === currentQuestion && !submitted ? 'gradient-primary text-primary-foreground shadow-elegant' : answers[getQuestionKey(question, index)] ? 'bg-primary/10 text-primary' : 'border border-border text-muted-foreground hover:border-primary'}`}
                >
                  {question.id || index + 1}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSubmit} className="rounded-full gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant transition-smooth hover:shadow-glow">
                {submitted ? 'Đã nộp' : 'Nộp bài'}
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default ExerciseAttemptPage;