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

function extractWritingPromptFromQuestions(questionsJson) {
  const parsed = parseQuestions(questionsJson);
  if (!Array.isArray(parsed) || parsed.length === 0) return '';
  const first = parsed[0] || {};
  if (typeof first?.prompt === 'string' && first.prompt.trim()) return first.prompt.trim();
  if (typeof first?.question === 'string' && first.question.trim()) return first.question.trim();
  return '';
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
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const transcriptRef = useRef('');
  const recordingAudioRef = useRef(null);
  const recordingBlobRef = useRef(null);

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
  const [speakingLoading, setSpeakingLoading] = useState(false);
  const [speakingResult, setSpeakingResult] = useState(null);
  const [speakingReportOpen, setSpeakingReportOpen] = useState(false);
  const [speakingIsPlaying, setSpeakingIsPlaying] = useState(false);
  const [speakingAudioProgress, setSpeakingAudioProgress] = useState(0);
  const [speakingAudioCurrent, setSpeakingAudioCurrent] = useState(0);
  const [speakingAudioDuration, setSpeakingAudioDuration] = useState(0);
  const [writingStructureTips, setWritingStructureTips] = useState([]);
  const [writingSampleAnswer, setWritingSampleAnswer] = useState('');
  const [writingAiLoading, setWritingAiLoading] = useState(false);
  const [speakingError, setSpeakingError] = useState('');

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
  const writingPromptFromQuestions = useMemo(
    () => extractWritingPromptFromQuestions(exercise?.questions_json || exercise?.questions || []),
    [exercise]
  );
  const readingPassage = String(exercise?.reading_passage || '').trim();
  const readingPassageDisplay = useMemo(() => extractIntroText(readingPassage), [readingPassage]);
  const taskPrompt = String(exercise?.task_prompt || exercise?.taskPrompt || writingPromptFromQuestions || exercise?.prompt || exercise?.reading_passage || '').trim();
  const speakingSampleAnswer = useMemo(
    () => String(speakingResult?.sample_answer || speakingResult?.sampleAnswer || exercise?.sample_answer || exercise?.sampleAnswer || '').trim(),
    [speakingResult, exercise]
  );
  const audioUrl = String(exercise?.audio_url || '').trim();
  const displayTitle = exercise?.title || 'Bài tập';
  const isReadingLike = ['reading', 'vocabulary', 'grammar'].includes(String(exercise?.skill_type || '').toLowerCase());
  const isReading = isReadingLike;
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
  const hasWritingSample = submitted && Boolean(String(writingSampleAnswer || exercise?.sample_answer || exercise?.sampleAnswer || '').trim());

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
      const selected = answers[String(question?.id ?? `q-${index}`)];
      const correctAnswerText = resolveCorrectAnswerText(question);
      return selected && selected === correctAnswerText ? acc + 1 : acc;
    }, 0);
  }, [submitted, questions, answers, isWriting]);

  const displaySkill = String(skill || exercise?.skill_type || '').toLowerCase();
  const hasQuestions = questions.length > 0;

  useEffect(() => {
    if (!isWriting || !exerciseId || !taskPrompt) return;
    let cancelled = false;

    const fetchWritingTips = async () => {
      try {
        const res = await api.post(`/exercises/${exerciseId}/writing-assist`, {
          includeSampleAnswer: false
        });
        if (cancelled) return;
        const tips = Array.isArray(res.data?.structureTips) ? res.data.structureTips : [];
        setWritingStructureTips(tips);
      } catch (_err) {
        if (!cancelled) setWritingStructureTips([]);
      }
    };

    fetchWritingTips();
    return () => {
      cancelled = true;
    };
  }, [isWriting, exerciseId, taskPrompt]);

  const handleSubmit = async () => {
    setSubmitted(true);
    const audio = audioRef.current;
    if (audio) audio.pause();
    setIsPlaying(false);

    if (!isWriting || writingAiLoading) return;
    setWritingAiLoading(true);
    try {
      const res = await api.post(`/exercises/${exerciseId}/writing-assist`, {
        includeSampleAnswer: true,
        submissionText: textResponse
      });
      const tips = Array.isArray(res.data?.structureTips) ? res.data.structureTips : [];
      setWritingStructureTips(tips);
      setWritingSampleAnswer(String(res.data?.sampleAnswer || '').trim());
    } catch (_err) {
      setWritingSampleAnswer('');
    } finally {
      setWritingAiLoading(false);
    }
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
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSpeakingReview = () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    if (!recordingBlobRef.current) {
      setSpeakingError('Chưa có bản ghi âm để nộp. Hãy ghi âm trước.');
      return;
    }

    if (!speakingLoading && !speakingResult) {
      sendToServer(recordingBlobRef.current, speechTranscript.trim(), speakingPrompt);
    }
  };

  const startRecording = async () => {
    setSpeakingReportOpen(false);
    setSubmitted(false);
    setSpeechTranscript('');
    setSpeakingResult(null);
    setSpeakingLoading(false);
    setSpeakingError('');
    recordingBlobRef.current = null;
    transcriptRef.current = '';
    setSpeakingAudioCurrent(0);
    setSpeakingAudioProgress(0);
    setSpeakingAudioDuration(0);

    // Setup MediaRecorder
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      const options = { mimeType: 'audio/webm;codecs=opus' };
      let mr;
      try {
        mr = new MediaRecorder(stream, options);
      } catch (e) {
        mr = new MediaRecorder(stream);
      }

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      mr.onstop = async () => {
        console.log('[MediaRecorder] onstop callback triggered');

        setTimeout(async () => {
          const blob = new Blob(audioChunksRef.current, {
            type: audioChunksRef.current[0]?.type || 'audio/webm'
          });

          // Store blob for later submission (don't auto-submit)
          recordingBlobRef.current = blob;
          console.log('[MediaRecorder] Blob stored, size:', blob.size);

          const blobUrl = URL.createObjectURL(blob);
          if (recordingAudioRef.current) {
            recordingAudioRef.current.src = blobUrl;
            console.log('[MediaRecorder] Audio element src set');
          }

          try {
            stream.getTracks().forEach((t) => t.stop());
          } catch (e) { }

          streamRef.current = null;
        }, 300);
      };

      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch (err) {
      console.error('getUserMedia error', err);
      setSpeakingError('Không thể truy cập microphone. Vui lòng cho phép quyền micro và thử lại.');
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      console.log('[Recording] Stopping MediaRecorder');
      try { mr.stop(); } catch (e) { console.warn(e); }
      mediaRecorderRef.current = null;
    }

    setIsRecording(false);
  };

  useEffect(() => {
    const audio = recordingAudioRef.current;
    if (!audio) return undefined;

    const syncState = () => {
      setSpeakingAudioCurrent(audio.currentTime || 0);
      setSpeakingAudioProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };

    const onLoadedMetadata = () => {
      setSpeakingAudioDuration(audio.duration || 0);
    };

    const onEnded = () => setSpeakingIsPlaying(false);

    audio.addEventListener('timeupdate', syncState);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', syncState);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const handleRecordingPlayPause = () => {
    const audio = recordingAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setSpeakingIsPlaying(true);
    } else {
      audio.pause();
      setSpeakingIsPlaying(false);
    }
  };

  const seekRecordingAudio = (nextTime) => {
    const audio = recordingAudioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(nextTime, audio.duration || nextTime));
    setSpeakingAudioCurrent(audio.currentTime || 0);
    setSpeakingAudioProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
  };

  const sendToServer = async (audioBlob, frontendTranscript, speakingPromptText) => {
    setSpeakingLoading(true);
    setSpeakingError('');
    setSpeakingResult(null);
    try {
      console.log('[sendToServer] Starting submission', {
        blobSize: audioBlob?.size,
        transcriptLength: frontendTranscript?.length,
        speakingPromptLength: speakingPromptText?.length
      });

      // Store blob for playback
      recordingBlobRef.current = audioBlob;
      const blobUrl = URL.createObjectURL(audioBlob);
      if (recordingAudioRef.current) {
        recordingAudioRef.current.src = blobUrl;
      }

      const fd = new FormData();
      fd.append('audio', audioBlob, 'recording.webm');
      fd.append('frontend_transcript', frontendTranscript || '');
      fd.append('speaking_prompt', speakingPromptText || speakingPrompt || '');

      console.log('[sendToServer] Sending to /speech/assess');
      const res = await api.post('/speech/assess', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000
      });
      const json = res.data || {};

      console.log('[sendToServer] Response received', {
        hasPronunciationScore: !!json.pronunciation_score,
        hasFluencyScore: !!json.fluency_score,
        transcriptLength: String(json.transcript || '').length,
        standardTranscriptLength: json.standard_transcript?.length,
        feedbackLength: json.feedback?.length
      });

      // prefer server transcript if available
      const serverTranscript = String(json.transcript || json.standard_transcript || json.standardTranscript || '').trim();
      if (serverTranscript) {
        setSpeechTranscript(serverTranscript);
        console.log('[sendToServer] Server transcript set', { length: serverTranscript.length });
      }

      setSpeakingResult(json);
      setSpeakingReportOpen(true);
      setSubmitted(true);
    } catch (err) {
      console.error('[sendToServer] Error during submission', {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status
      });
      setSpeakingError(
        err?.code === 'ECONNABORTED'
          ? 'Hệ thống chấm speaking đang xử lý lâu hơn bình thường. Vui lòng thử lại sau ít phút.'
          : err?.response?.data?.message || err?.message || 'Lỗi gửi bài. Vui lòng thử lại.'
      );
      setSpeakingResult(null);
    } finally {
      setSpeakingLoading(false);
    }
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
                    <audio ref={recordingAudioRef} preload="metadata" />
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
                      ) : recordingBlobRef.current ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-18 w-18 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Headphones className="h-8 w-8" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">Bản ghi của bạn</p>
                                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                    Nhấn Play để nghe lại bản ghi của bạn.
                                  </p>
                                </div>
                                <div className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  Ready
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-3 rounded-2xl border border-border bg-secondary/40 p-4">
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="w-11 text-right font-mono">{formatTime(speakingAudioCurrent)}</span>
                              <div className="relative flex-1">
                                <div className="h-2 w-full rounded-full bg-secondary cursor-pointer" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const pos = (e.clientX - rect.left) / rect.width; seekRecordingAudio(pos * (speakingAudioDuration || 0)); }}>
                                  <div className="h-2 rounded-full gradient-primary transition-smooth" style={{ width: `${speakingAudioProgress}%` }} />
                                </div>
                              </div>
                              <span className="w-11 font-mono">{formatTime(speakingAudioDuration || 0)}</span>
                            </div>
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={handleRecordingPlayPause} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background transition-smooth hover:border-primary hover:text-primary">
                                <SkipBack className="h-4 w-4" />
                              </button>
                              <button onClick={handleRecordingPlayPause} className="inline-flex h-12 w-12 items-center justify-center rounded-full gradient-primary text-primary-foreground shadow-elegant transition-smooth hover:shadow-glow">
                                {speakingIsPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                              </button>
                              <button onClick={() => seekRecordingAudio(speakingAudioCurrent + 5)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background transition-smooth hover:border-primary hover:text-primary">
                                <SkipForward className="h-4 w-4" />
                              </button>
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
                                  Bấm Ghi âm để bắt đầu recording.
                                </p>
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
                      {!isRecording && recordingBlobRef.current && !speakingLoading && !submitted && (
                        <button
                          onClick={() => handleSpeakingReview()}
                          className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-elegant transition-smooth hover:bg-green-700 hover:shadow-glow"
                        >
                          <Sparkles className="h-4 w-4" />
                          Nộp bài để chấm điểm
                        </button>
                      )}
                      {speakingLoading && (
                        <button disabled className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-elegant opacity-75 cursor-not-allowed">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Đang chấm điểm...
                        </button>
                      )}
                      {submitted && (
                        <button disabled className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-elegant opacity-75 cursor-not-allowed">
                          <BadgeCheck className="h-4 w-4" />
                          Đã nộp
                        </button>
                      )}
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
                  {speakingError && (
                    <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                      <div className="font-semibold">Lỗi gửi bài:</div>
                      <div className="mt-1">{speakingError}</div>
                      <button
                        onClick={() => {
                          setSpeakingError('');
                          if (recordingBlobRef.current && speechTranscript.trim()) {
                            handleSpeakingReview();
                          }
                        }}
                        className="mt-3 text-xs underline hover:no-underline"
                      >
                        Thử lại
                      </button>
                    </div>
                  )}
                  <div className="rounded-3xl border border-border bg-background p-5 text-sm leading-7 text-foreground/85 shadow-card">
                    {isRecording ? (
                      <div>
                        <div className="text-sm font-semibold text-destructive">Đang ghi âm — Transcript (live)</div>
                        <div className="mt-3 whitespace-pre-wrap">{speechTranscript || 'Đang lắng nghe...'}</div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm font-semibold">Transcript thô</div>
                        <div className="mt-3 whitespace-pre-wrap">
                          {speechTranscript || (isRecording ? 'Đang ghi âm. Transcript sẽ được AI tạo sau khi nộp bài.' : 'Chưa có transcript. Bấm Ghi âm để bắt đầu.')}
                        </div>
                        {speakingLoading && <div className="mt-3 text-xs text-muted-foreground">⏳ Đang xử lý AI...</div>}
                      </div>
                    )}
                  </div>
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
                      {(
                        speakingResult
                          ? [
                            { label: 'Fluency', value: (speakingResult.fluency_score ?? speakingResult.fluency ?? null) ? `${speakingResult.fluency_score ?? speakingResult.fluency}/100` : '—' },
                            { label: 'Grammar', value: speakingResult.grammar_score ? `${speakingResult.grammar_score}/100` : '—' },
                            { label: 'Vocabulary', value: speakingResult.vocabulary_score ? `${speakingResult.vocabulary_score}/100` : '—' },
                            { label: 'Pronunciation', value: (speakingResult.pronunciation_score ?? speakingResult.pronunciation ?? null) ? `${speakingResult.pronunciation_score ?? speakingResult.pronunciation}/100` : '—' },
                          ]
                          : [
                            { label: 'Fluency', value: '—' },
                            { label: 'Grammar', value: '—' },
                            { label: 'Vocabulary', value: '—' },
                            { label: 'Pronunciation', value: '—' },
                          ]
                      ).map((item) => (
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
                      {(() => {
                        if (speakingLoading) {
                          return <li>• Đang phân tích bài nói...</li>;
                        }

                        const feedbackList =
                          typeof speakingResult?.feedback === 'string'
                            ? speakingResult.feedback.trim()
                              ? [speakingResult.feedback]
                              : []
                            : Array.isArray(speakingResult?.feedback)
                              ? speakingResult.feedback
                              : [];

                        if (feedbackList.length > 0) {
                          return feedbackList.slice(0, 5).map((f, i) => (
                            <li key={i}>• {f}</li>
                          ));
                        }

                        return <li>• Chưa có nhận xét chi tiết từ hệ thống.</li>;
                      })()}
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

                  <div className="rounded-[24px] border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Mẫu trả lời / đáp án
                    </div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                      {speakingSampleAnswer || 'Chưa có mẫu trả lời cho bài nói này.'}
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
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Writing task</p>
                  <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{exercise?.title || 'Writing task'}</h2>
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
                  <button onClick={handleSubmit} disabled={submitted || writingAiLoading || (writingMinWords > 0 && wordCount < writingMinWords)} className="rounded-full gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant transition-smooth hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50">
                    {submitted ? 'Đã nộp' : 'Nộp bài'}
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
                  {(writingStructureTips.length > 0 ? writingStructureTips : [
                    'Introduction: paraphrase the topic and state your opinion.',
                    'Body 1: present the first main reason with an example.',
                    'Body 2: present the second main reason or counterpoint.',
                    'Conclusion: restate your view clearly and concisely.',
                  ]).map((item) => (
                    <div key={item} className="rounded-2xl border border-border bg-secondary/35 px-3 py-2 leading-6">{item}</div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-border bg-card p-5 shadow-card">
                <div className="mb-3 text-sm font-semibold">Sample answer</div>
                <p className="text-sm leading-7 text-muted-foreground">
                  {hasWritingSample
                    ? (String(writingSampleAnswer || exercise?.sample_answer || exercise?.sampleAnswer || '').trim() || 'Chưa có bài mẫu cho bài viết này.')
                    : (writingAiLoading ? 'AI đang tạo bài mẫu...' : 'Nhấn Submit để xem bài mẫu do AI tạo.')}
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