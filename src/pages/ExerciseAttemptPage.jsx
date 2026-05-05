import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, BrainCircuit, CheckCircle2, Clock3, FileText, Headphones, Mic, MicOff, Pause, Play, SkipBack, SkipForward, Speaker, Sparkles, Volume2, X } from 'lucide-react';
import api from '../services/api';

function parseQuestions(questionsJson) {
  if (Array.isArray(questionsJson)) return questionsJson;
  try {
    return JSON.parse(questionsJson || '[]');
  } catch {
    return [];
  }
}

function formatTime(totalSeconds) {
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  const secs = Math.max(0, totalSeconds) % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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
  const { courseId, skill, exerciseId } = useParams();
  const audioRef = useRef(null);
  const questionRefs = useRef([]);

  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [textResponse, setTextResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrent, setAudioCurrent] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [speakingReportOpen, setSpeakingReportOpen] = useState(false);

  const goBack = () => {
    navigate(-1);
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
  const readingPassage = String(exercise?.reading_passage || '').trim();
  const readingPassageDisplay = useMemo(() => extractIntroText(readingPassage), [readingPassage]);
  const taskPrompt = String(exercise?.task_prompt || exercise?.prompt || '').trim();
  const audioUrl = String(exercise?.audio_url || '').trim();
  const displayTitle = exercise?.title || 'Bài tập';
  const isReading = exercise?.skill_type === 'reading';
  const isListening = exercise?.skill_type === 'listening';
  const isWriting = exercise?.skill_type === 'writing';
  const isSpeaking = exercise?.skill_type === 'speaking';
  const speakingPrompt = taskPrompt || displayTitle;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const syncState = () => {
      setAudioCurrent(audio.currentTime || 0);
      setAudioProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };

    const onEnded = () => setIsPlaying(false);

    audio.playbackRate = playbackRate;
    audio.addEventListener('timeupdate', syncState);
    audio.addEventListener('loadedmetadata', syncState);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', syncState);
      audio.removeEventListener('loadedmetadata', syncState);
      audio.removeEventListener('ended', onEnded);
    };
  }, [playbackRate]);

  const wordCount = useMemo(() => {
    const trimmed = textResponse.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [textResponse]);

  const writingMinWords = Number(exercise?.min_words || exercise?.minWords || 0);
  const writingTargetWords = Number(exercise?.target_words || exercise?.targetWords || 250);
  const writingProgress = Math.min(100, writingTargetWords > 0 ? (wordCount / writingTargetWords) * 100 : 0);

  const score = useMemo(() => {
    if (!submitted || questions.length === 0 || isWriting) return 0;
    return questions.reduce((acc, question, index) => {
      const selected = answers[String(question?.id ?? `q-${index}`)];
      const correctAnswerText = resolveCorrectAnswerText(question);
      return selected && selected === correctAnswerText ? acc + 1 : acc;
    }, 0);
  }, [submitted, questions, answers, isWriting]);

  const displaySkill = String(skill || exercise?.skill_type || '').toLowerCase();
  const hasQuestions = questions.length > 0;

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
      audio.play();
      setIsPlaying(true);
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

  const getQuestionKey = (question, index) => String(question?.id ?? `q-${index}`);

  const selectAnswer = (questionKey, value) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
  };

  const toggleSpeakingRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setSpeechTranscript((prev) => prev.trim() ? prev : `AI transcript thô: ${speakingPrompt}`);
      return;
    }

    setSpeakingReportOpen(false);
    setSubmitted(false);
    setSpeechTranscript('');
    setIsRecording(true);
  };

  const handleSpeakingReview = () => {
    if (isRecording) {
      setIsRecording(false);
      setSpeechTranscript((prev) => prev.trim() ? prev : `AI transcript thô: ${speakingPrompt}`);
    }

    if (!speechTranscript.trim()) {
      setSpeechTranscript(`AI transcript thô: ${speakingPrompt}`);
    }

    setSpeakingReportOpen(true);
    setSubmitted(true);
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
              {submitted ? (isWriting ? `Đã nộp | ${wordCount} từ` : `Đã nộp | ${score}/${questions.length}`) : `Còn lại ${formatTime(secondsLeft)}`}
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
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
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
                  {(readingPassageDisplay || readingPassage || 'Chưa có nội dung bài đọc.').split('\n\n').map((paragraph, index) => (
                    <p key={index} className="mb-4 text-sm leading-7 text-foreground/85">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">


              <div className="custom-scrollbar space-y-4 overflow-y-auto pr-1 xl:max-h-[calc(100vh-260px)]">
                {questions.map((question, index) => {
                  const questionKey = getQuestionKey(question, index);
                  const selectedAnswer = answers[questionKey];
                  const correctAnswerText = resolveCorrectAnswerText(question);
                  const isCorrect = submitted && selectedAnswer === correctAnswerText;
                  const isWrong = submitted && selectedAnswer && selectedAnswer !== correctAnswerText;

                  return (
                    <article
                      key={question.id || index}
                      ref={(el) => {
                        questionRefs.current[index] = el;
                      }}
                      className={`rounded-[24px] border bg-card p-5 shadow-card transition-smooth ${index === currentQuestion && !submitted ? 'border-primary shadow-elegant' : 'border-border'} ${isCorrect ? 'border-success bg-success/5' : ''} ${isWrong ? 'border-destructive bg-destructive/5' : ''}`}
                    >
                      <div className="mb-4 flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-primary text-sm font-bold text-primary-foreground">{question.id || index + 1}</div>
                        <h3 className="pt-1 text-sm font-medium leading-6">{getQuestionText(question)}</h3>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {normalizeOptions(question).map((option, optionIndex) => {
                          const isSelected = selectedAnswer === option.value;
                          const isOptionCorrect = submitted && correctAnswerText === option.value;
                          const isOptionWrong = submitted && isSelected && !isOptionCorrect;

                          return (
                            <button
                              key={`${question.id || index}-${optionIndex}`}
                              onClick={() => selectAnswer(questionKey, option.value)}
                              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-smooth ${!submitted && isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/80'} ${isOptionCorrect ? 'border-success bg-success/10' : ''} ${isOptionWrong ? 'border-destructive bg-destructive/10' : ''}`}
                              disabled={submitted}
                            >
                              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${!submitted && isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'} ${isOptionCorrect ? 'border-success bg-success text-success-foreground' : ''} ${isOptionWrong ? 'border-destructive bg-destructive text-destructive-foreground' : ''}`}>
                                {isOptionCorrect && <CheckCircle2 className="h-3.5 w-3.5" />}
                                {isOptionWrong ? '!' : option.label}
                              </span>
                              <span className="leading-6 text-foreground">{option.value}</span>
                            </button>
                          );
                        })}
                      </div>
                    </article>
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
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="w-11 text-right font-mono">{formatTime(audioCurrent)}</span>
                  <div className="relative flex-1">
                    <div className="h-2 w-full rounded-full bg-secondary">
                      <div className="h-2 rounded-full gradient-primary transition-smooth" style={{ width: `${audioProgress}%` }} />
                    </div>
                  </div>
                  <span className="w-11 font-mono">{formatTime((audioRef.current && audioRef.current.duration) || exercise?.audio_duration || 0)}</span>
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

                return (
                  <article
                    key={question.id || index}
                    ref={(el) => {
                      questionRefs.current[index] = el;
                    }}
                    className={`rounded-[24px] border bg-card p-5 shadow-card transition-smooth ${index === currentQuestion && !submitted ? 'border-primary shadow-elegant' : 'border-border'} ${isCorrect ? 'border-success bg-success/5' : ''} ${isWrong ? 'border-destructive bg-destructive/5' : ''}`}
                  >
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-primary text-sm font-bold text-primary-foreground">{question.id || index + 1}</div>
                      <h3 className="pt-1 text-sm font-medium leading-6">{getQuestionText(question)}</h3>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {normalizeOptions(question).map((option, optionIndex) => {
                        const isSelected = selectedAnswer === option.value;
                        const isOptionCorrect = submitted && correctAnswerText === option.value;
                        const isOptionWrong = submitted && isSelected && !isOptionCorrect;

                        return (
                          <button
                            key={`${question.id || index}-${optionIndex}`}
                            onClick={() => selectAnswer(questionKey, option.value)}
                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-smooth ${!submitted && isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/80'} ${isOptionCorrect ? 'border-success bg-success/10' : ''} ${isOptionWrong ? 'border-destructive bg-destructive/10' : ''}`}
                            disabled={submitted}
                          >
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${!submitted && isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'} ${isOptionCorrect ? 'border-success bg-success text-success-foreground' : ''} ${isOptionWrong ? 'border-destructive bg-destructive text-destructive-foreground' : ''}`}>
                              {isOptionCorrect && <CheckCircle2 className="h-3.5 w-3.5" />}
                              {isOptionWrong ? '!' : option.label}
                            </span>
                            <span className="leading-6 text-foreground">{option.value}</span>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        )}

        {!loading && !error && isSpeaking && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.9fr)]">
            <section className="space-y-6">
              <article className="overflow-hidden rounded-[32px] border border-border bg-card shadow-card">
                <div className="border-b border-border bg-secondary/40 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Speaking Question</p>
                      <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{displayTitle}</h2>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground/70">
                        {speakingPrompt || 'Hãy trả lời chủ đề speaking bên dưới theo cách tự nhiên nhất có thể.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_0.95fr] lg:items-center">

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-border bg-background p-5">
                      {isRecording ? (
                        <div className="flex items-center gap-4">
                          <div className="relative flex h-18 w-18 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                            <span className="absolute h-full w-full animate-ping rounded-full bg-destructive/30" />
                            <span className="absolute h-14 w-14 rounded-full bg-destructive/20 animate-pulse" />
                            <Mic className="relative h-8 w-8" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                              <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
                              Đang ghi âm
                            </div>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              Hãy nói câu trả lời của bạn. Khi dừng ghi âm, phần transcript sẽ xuất hiện ngay bên dưới.
                            </p>
                            <div className="mt-4 flex items-end gap-1.5">
                              {[10, 18, 28, 16, 24, 14, 30, 20].map((height, index) => (
                                <span
                                  key={index}
                                  className="w-2 rounded-full bg-destructive/70 animate-pulse"
                                  style={{ height: `${height}px`, animationDelay: `${index * 90}ms` }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="flex h-18 w-18 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Volume2 className="h-8 w-8" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">Audio Player</p>
                                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                  Bản ghi đã dừng. Bạn có thể nghe lại hoặc chấm bài ngay.
                                </p>
                              </div>
                              <div className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Ready
                              </div>
                            </div>
                            <div className="mt-4 grid gap-2">
                              <div className="flex items-center gap-1.5">
                                {[22, 12, 30, 16, 24, 10, 28, 18, 26, 14, 20, 12].map((height, index) => (
                                  <span key={index} className="w-2 rounded-full bg-primary/40" style={{ height: `${height}px` }} />
                                ))}
                              </div>
                              <div className="h-2 rounded-full bg-secondary">
                                <div className="h-2 w-1/3 rounded-full gradient-primary" />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={toggleSpeakingRecording}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-elegant transition-smooth ${isRecording ? 'bg-destructive text-white hover:opacity-95' : 'gradient-primary text-primary-foreground hover:shadow-glow'}`}
                      >
                        {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        {isRecording ? 'Dừng ghi âm' : 'Ghi âm'}
                      </button>
                    </div>
                  </div>
                </div>
              </article>

              <article className="overflow-hidden rounded-[32px] border border-border bg-card shadow-card">
                <div className="border-b border-border bg-secondary/40 px-5 py-4 sm:px-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Speech-to-Text Script</p>
                  <h3 className="mt-1 text-lg font-bold">Transcript thô từ AI</h3>
                </div>
                <div className="p-5 sm:p-6">
                  {isRecording ? (
                    <div className="rounded-3xl border border-dashed border-border bg-muted/40 p-6 text-sm leading-7 text-muted-foreground">
                      Transcript sẽ xuất hiện ngay sau khi bạn dừng ghi âm.
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-border bg-background p-5 text-sm leading-7 text-foreground/85 shadow-card">
                      {speechTranscript || 'Chưa có transcript. Bấm Ghi âm để bắt đầu.'}
                    </div>
                  )}
                </div>
              </article>
            </section>

            <aside className="space-y-4">
              <div className="rounded-[28px] border border-border bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Contextual Sidebar</p>
                    <h3 className="mt-1 text-xl font-bold">{speakingReportOpen ? 'Báo cáo AI' : 'Công thức / Gợi ý'}</h3>
                  </div>
                  <button
                    onClick={() => setSpeakingReportOpen((prev) => !prev)}
                    className="rounded-full border border-border bg-background px-3 py-2 text-sm font-semibold transition-smooth hover:border-primary hover:text-primary"
                  >
                    {speakingReportOpen ? 'Xem gợi ý' : 'Nộp bài'}
                  </button>
                </div>
              </div>

              {!speakingReportOpen ? (
                <div className="overflow-hidden rounded-[28px] border border-border bg-card shadow-card">
                  <div className="space-y-3 p-5">
                    {[
                      { title: 'Introduction', text: 'Nêu ý chính ngay từ đầu, trả lời trực tiếp câu hỏi.' },
                      { title: 'Development', text: 'Mở rộng ý bằng 1-2 ví dụ ngắn, giữ câu ngắn và rõ.' },
                      { title: 'Finish', text: 'Kết bài bằng một câu chốt ngắn, tự nhiên và mạch lạc.' },
                    ].map((item) => (
                      <div key={item.title} className="rounded-2xl border border-border bg-background p-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <p className="text-sm font-semibold">{item.title}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-[28px] border border-border bg-card p-5 shadow-card">
                  <div className="rounded-[24px] border border-success/20 bg-success/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-success">
                      <BadgeCheck className="h-4 w-4" />
                      Điểm tổng quan
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      {[
                        { label: 'Fluency', value: '8.2/10' },
                        { label: 'Grammar', value: '7.6/10' },
                        { label: 'Vocabulary', value: '8.0/10' },
                        { label: 'Pronunciation', value: '7.9/10' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-border bg-background p-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
                          <div className="mt-1 text-base font-bold">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <BrainCircuit className="h-4 w-4 text-primary" />
                      Sửa lỗi / Gợi ý
                    </div>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                      <li>• Dùng câu ngắn hơn để tránh ngập ngừng.</li>
                      <li>• Thêm từ nối như however, therefore, for example.</li>
                      <li>• Nhấn rõ từ khóa chính trong câu trả lời.</li>
                    </ul>
                  </div>

                  <div className="rounded-[24px] border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4 text-primary" />
                      Gợi ý từ vựng
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['clarity', 'confidence', 'example', 'structure', 'pronunciation'].map((word) => (
                        <span key={word} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}

        {!loading && !error && isWriting && (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="overflow-hidden rounded-[32px] border border-border bg-card shadow-card">
              <div className="grid gap-5 border-b border-border bg-secondary/40 p-5 sm:p-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-indigo-700 to-cyan-600 p-3 shadow-elegant">
                  <img src="/images/writing-illustration.png" alt="Writing illustration" className="h-full w-full rounded-[22px] object-cover opacity-95" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Writing task</p>
                  <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{exercise?.title || 'Writing task'}</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/70">
                    Khung viết được mở rộng theo chiều ngang để người học có cảm giác như đang làm việc trong một editor thực thụ.
                  </p>
                </div>
              </div>
              <div className="space-y-5 p-5 sm:p-6">
                <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                  <div className="mb-2 text-sm font-semibold text-foreground">Đề bài</div>
                  <p className="whitespace-pre-line text-sm leading-7 text-foreground/85">{taskPrompt || 'Chưa có đề bài.'}</p>
                </div>
                <textarea
                  value={textResponse}
                  onChange={(e) => setTextResponse(e.target.value)}
                  placeholder="Start writing your essay here..."
                  className="min-h-[420px] w-full resize-none rounded-3xl border border-border bg-background p-5 text-sm leading-7 outline-none transition-smooth focus:border-primary focus:ring-2 focus:ring-primary/10"
                  disabled={submitted}
                  spellCheck
                />
                <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                  <span>{wordCount} từ</span>
                  <span>Từ mục tiêu: {writingTargetWords || '—'}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div className={`h-2 rounded-full transition-smooth ${wordCount >= writingMinWords ? 'gradient-success' : 'gradient-primary'}`} style={{ width: `${writingProgress}%` }} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button onClick={goBack} className="rounded-full border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-smooth hover:border-primary hover:text-primary">
                    Save & Exit
                  </button>
                  <button onClick={handleSubmit} disabled={submitted || (writingMinWords > 0 && wordCount < writingMinWords)} className="rounded-full gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant transition-smooth hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50">
                    {submitted ? 'Đã nộp' : 'Submit Essay'}
                  </button>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-[28px] border border-border bg-card p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Support panel</p>
                <h3 className="mt-1 text-xl font-bold">Writing support</h3>
              </div>

              <div className="rounded-[24px] border border-border bg-card p-5 shadow-card">
                <div className="mb-3 text-sm font-semibold">Structure</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {[
                    'Introduction: paraphrase the topic and state your opinion.',
                    'Body 1: present the first main reason with an example.',
                    'Body 2: present the second main reason or counterpoint.',
                    'Conclusion: restate your view clearly and concisely.',
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-border bg-secondary/35 px-3 py-2 leading-6">{item}</div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-border bg-card p-5 shadow-card">
                <div className="mb-3 text-sm font-semibold">Sample answer</div>
                <p className="text-sm leading-7 text-muted-foreground">
                  {String(exercise?.sample_answer || exercise?.sampleAnswer || '').trim() || 'Chưa có bài mẫu cho bài viết này.'}
                </p>
              </div>

              <div className="rounded-[24px] border border-border bg-card p-5 shadow-card">
                <div className="mb-3 text-sm font-semibold">Timer</div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 font-mono text-sm font-semibold">
                  <Clock3 className="h-4 w-4" />
                  {formatTime(secondsLeft)}
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>

      

      {!loading && !error && isListening && (
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