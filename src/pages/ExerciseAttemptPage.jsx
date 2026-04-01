import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

function parseLessonContent(content) {
  try {
    return JSON.parse(content || '{}');
  } catch {
    return {};
  }
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function ExerciseAttemptPage() {
  const navigate = useNavigate();
  const { courseId, skill, lessonId } = useParams();

  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    api.get(`/lessons/${lessonId}`)
      .then((res) => {
        setLesson(res.data);
        const content = parseLessonContent(res.data?.content);
        const questionCount = Array.isArray(content?.questions) ? content.questions.length : 0;
        setSecondsLeft(Math.max(questionCount * 90, 300));
        setLoading(false);
      })
      .catch(() => {
        setError('Không tải được bài tập');
        setLoading(false);
      });
  }, [lessonId]);

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

  const content = useMemo(() => parseLessonContent(lesson?.content), [lesson]);
  const questions = Array.isArray(content?.questions) ? content.questions : [];
  const readingPassage = String(content?.readingPassage || '').trim();

  const score = useMemo(() => {
    if (!submitted || questions.length === 0) return 0;
    const correct = questions.reduce((acc, q, idx) => {
      const selected = answers[idx];
      return selected && selected === q.correctAnswer ? acc + 1 : acc;
    }, 0);
    return Math.round((correct / questions.length) * 100);
  }, [submitted, questions, answers]);

  const jumpToQuestion = (index) => {
    const node = document.getElementById(`question-${index}`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSubmit = () => {
    setSubmitted(true);
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <button onClick={() => navigate(`/courses/${courseId}/skills/${skill}/exercises`)} style={styles.backBtn}>← Danh sách bài</button>
        <div style={styles.titleArea}>
          <h2 style={styles.title}>{lesson?.title || 'Bài tập'}</h2>
          <p style={styles.subtitle}>Kỹ năng: {String(skill || '').toUpperCase()} | Thời gian còn lại: {formatTime(secondsLeft)}</p>
        </div>
        <button onClick={handleSubmit} disabled={submitted || questions.length === 0} style={styles.submitBtn}>Nộp bài</button>
      </div>

      <div style={styles.main}>
        <div style={styles.leftCol}>
          {loading && <p style={styles.statusText}>Đang tải...</p>}
          {error && <p style={styles.errorText}>{error}</p>}

          {!loading && !error && (
            <>
              {readingPassage && (
                <div style={styles.passageCard}>
                  <h3 style={styles.sectionTitle}>Bài đọc</h3>
                  <p style={styles.passageText}>{readingPassage}</p>
                </div>
              )}

              <div style={styles.questionsCard}>
                <h3 style={styles.sectionTitle}>Câu hỏi</h3>
                {questions.map((q, idx) => (
                  <div key={idx} id={`question-${idx}`} style={styles.questionBlock}>
                    <div style={styles.questionText}>{idx + 1}. {q.question}</div>
                    <div style={styles.optionGrid}>
                      {(q.options || []).map((opt, optionIndex) => {
                        const selected = answers[idx] === opt;
                        const isCorrect = submitted && opt === q.correctAnswer;
                        const isWrongSelected = submitted && selected && opt !== q.correctAnswer;

                        return (
                          <button
                            type="button"
                            key={optionIndex}
                            disabled={submitted}
                            onClick={() => setAnswers((prev) => ({ ...prev, [idx]: opt }))}
                            style={{
                              ...styles.optionBtn,
                              ...(selected ? styles.optionSelected : {}),
                              ...(isCorrect ? styles.optionCorrect : {}),
                              ...(isWrongSelected ? styles.optionWrong : {})
                            }}
                          >
                            {String.fromCharCode(65 + optionIndex)}. {opt}
                          </button>
                        );
                      })}
                    </div>
                    {submitted && q.explanation && (
                      <div style={styles.explain}><strong>Giải thích:</strong> {q.explanation}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={styles.rightCol}>
          <div style={styles.panelCard}>
            <h4 style={styles.panelTitle}>Điều hướng câu hỏi</h4>
            <div style={styles.navGrid}>
              {questions.map((_, idx) => {
                const answered = Boolean(answers[idx]);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => jumpToQuestion(idx)}
                    style={{
                      ...styles.navBtn,
                      ...(answered ? styles.navAnswered : {})
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            {submitted && <div style={styles.scoreBox}>Điểm: {score}/100</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: '100vh', background: '#f1f3f6', fontFamily: 'sans-serif' },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: '#ffffff',
    borderBottom: '1px solid #dfe4ea',
    padding: '12px 18px',
    display: 'grid',
    gridTemplateColumns: '180px 1fr 120px',
    alignItems: 'center',
    gap: '12px'
  },
  backBtn: { border: '1px solid #cfd8e3', background: '#f8fbff', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer' },
  titleArea: { minWidth: 0 },
  title: { margin: 0, color: '#1e293b', fontSize: '20px' },
  subtitle: { margin: '4px 0 0 0', color: '#475569', fontSize: '14px' },
  submitBtn: { border: 'none', background: '#1d4ed8', color: '#fff', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', fontWeight: '700' },
  main: {
    maxWidth: '1300px',
    margin: '16px auto',
    padding: '0 16px',
    display: 'grid',
    gridTemplateColumns: '1fr 280px',
    gap: '16px'
  },
  leftCol: { minWidth: 0 },
  rightCol: { position: 'sticky', top: '88px', height: 'fit-content' },
  passageCard: { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '14px', border: '1px solid #e2e8f0' },
  questionsCard: { background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' },
  sectionTitle: { marginTop: 0, color: '#0f172a' },
  passageText: { whiteSpace: 'pre-line', lineHeight: 1.6, color: '#334155' },
  questionBlock: { borderTop: '1px solid #e5e7eb', paddingTop: '14px', marginTop: '14px' },
  questionText: { fontWeight: '700', color: '#111827', marginBottom: '10px' },
  optionGrid: { display: 'grid', gap: '8px' },
  optionBtn: { textAlign: 'left', border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', padding: '10px', cursor: 'pointer' },
  optionSelected: { borderColor: '#2563eb', background: '#eff6ff' },
  optionCorrect: { borderColor: '#16a34a', background: '#ecfdf3' },
  optionWrong: { borderColor: '#dc2626', background: '#fef2f2' },
  explain: { marginTop: '8px', color: '#475569', fontSize: '14px' },
  panelCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' },
  panelTitle: { marginTop: 0, marginBottom: '10px', color: '#0f172a' },
  navGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' },
  navBtn: { border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', minHeight: '34px', cursor: 'pointer' },
  navAnswered: { background: '#dbeafe', borderColor: '#60a5fa' },
  scoreBox: { marginTop: '12px', background: '#f8fafc', border: '1px solid #dbeafe', padding: '10px', borderRadius: '8px', fontWeight: '700', color: '#1e3a8a' },
  statusText: { textAlign: 'center', padding: '24px', color: '#64748b' },
  errorText: { textAlign: 'center', padding: '24px', color: '#dc2626' }
};

export default ExerciseAttemptPage;
