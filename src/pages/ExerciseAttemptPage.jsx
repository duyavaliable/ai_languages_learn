import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

function parseQuestions(questionsJson) {
  try {
    return JSON.parse(questionsJson || '[]');
  } catch {
    return [];
  }
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function ExerciseAttemptPage() {
  const navigate = useNavigate();
  const { courseId, skill, exerciseId } = useParams();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isTeacherOrAdmin = ['teacher', 'admin'].includes(currentUser.role);

  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [textResponse, setTextResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [recorderError, setRecorderError] = useState('');
  const [mediaRecorder, setMediaRecorder] = useState(null);
  
  const [editingField, setEditingField] = useState(null);
  const [editValues, setEditValues] = useState({ taskPrompt: '', sampleAnswer: '', readingPassage: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  
  const [editMode, setEditMode] = useState(false);
  const [editQuestions, setEditQuestions] = useState([]);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [deletingExercise, setDeletingExercise] = useState(false);
  const [editFormData, setEditFormData] = useState({
    sampleAnswer: '',
    readingPassage: ''
  });

  useEffect(() => {
    api.get(`/exercises/${exerciseId}`)
      .then((res) => {
        setExercise(res.data);
        const questions = parseQuestions(res.data?.questions_json);
        const questionCount = Array.isArray(questions) ? questions.length : 0;
        setSecondsLeft(Number(res.data?.time_limit_sec) || Math.max(questionCount * 90, 300));
        setLoading(false);
      })
      .catch((err) => {
        const msg = err?.response?.data?.message || 'Không tải được bài tập';
        setError(msg);
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

  const questions = useMemo(() => parseQuestions(exercise?.questions_json), [exercise]);
  const readingPassage = String(exercise?.reading_passage || '').trim();
  const taskPrompt = String(exercise?.task_prompt || '').trim();
  const audioUrl = exercise?.audio_url || '';
  const isReading = exercise?.skill_type === 'reading';
  const isListening = exercise?.skill_type === 'listening';
  const isWriting = exercise?.skill_type === 'writing';
  const isSpeaking = exercise?.skill_type === 'speaking';

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

  const startEdit = (field) => {
    const value = exercise?.[field === 'taskPrompt' ? 'task_prompt' : field === 'sampleAnswer' ? 'sample_answer' : 'reading_passage'] || '';
    setEditValues((prev) => ({ ...prev, [field]: value }));
    setEditingField(field);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValues({ taskPrompt: '', sampleAnswer: '', readingPassage: '' });
  };

  const saveEdit = async () => {
    try {
      setSavingEdit(true);
      const updatePayload = {};
      if (editingField === 'taskPrompt') updatePayload.taskPrompt = editValues.taskPrompt;
      if (editingField === 'sampleAnswer') updatePayload.sampleAnswer = editValues.sampleAnswer;
      if (editingField === 'readingPassage') updatePayload.readingPassage = editValues.readingPassage;

      const res = await api.put(`/exercises/${exerciseId}`, updatePayload);
      setExercise(res.data.exercise);
      setEditingField(null);
      setEditValues({ taskPrompt: '', sampleAnswer: '', readingPassage: '' });
    } catch (err) {
      alert('Lỗi lưu: ' + (err.response?.data?.message || err.message));
    } finally {
      setSavingEdit(false);
    }
  };

  const enterEditMode = () => {
    const questions = parseQuestions(exercise?.questions_json);
    setEditQuestions(JSON.parse(JSON.stringify(questions)));
    setEditFormData({
      sampleAnswer: exercise?.sample_answer || '',
      readingPassage: exercise?.reading_passage || ''
    });
    setEditMode(true);
  };

  const exitEditMode = () => {
    setEditMode(false);
    setEditQuestions([]);
    setEditFormData({ sampleAnswer: '', readingPassage: '' });
  };

  const updateEditQuestion = (index, field, value) => {
    setEditQuestions((prev) => {
      const updated = [...prev];
      if (field === 'option') {
        if (!updated[index].options) updated[index].options = [];
        updated[index].options[value.optionIndex] = value.text;
      } else {
        updated[index][field] = value;
      }
      return updated;
    });
  };

  const saveEditedQuestions = async () => {
    try {
      setSavingQuestions(true);
      
      const updatePayload = {
        questions: editQuestions
      };
      
      if (editFormData.sampleAnswer !== '') {
        updatePayload.sampleAnswer = editFormData.sampleAnswer;
      }
      
      if (editFormData.readingPassage !== '') {
        updatePayload.readingPassage = editFormData.readingPassage;
      }

      const res = await api.put(`/exercises/${exerciseId}`, updatePayload);
      setExercise(res.data.exercise);
      setEditMode(false);
      setEditQuestions([]);
      setEditFormData({ sampleAnswer: '', readingPassage: '' });
    } catch (err) {
      alert('Lỗi lưu: ' + (err.response?.data?.message || err.message));
    } finally {
      setSavingQuestions(false);
    }
  };

  const startRecording = async () => {
    try {
      setRecorderError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch {
      setRecorderError('Không thể truy cập micro. Hãy cấp quyền microphone cho trình duyệt.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const deleteCurrentExercise = async () => {
    if (!isTeacherOrAdmin || !exerciseId || deletingExercise) return;

    const role = String(currentUser?.role || '').toLowerCase();
    const modeText = role === 'admin'
      ? 'xoa cung (xoa vinh vien)'
      : 'xoa mem (an bai khoi danh sach)';

    const confirmed = window.confirm(`Ban chac chan muon ${modeText} bai nay?`);
    if (!confirmed) return;

    try {
      setDeletingExercise(true);
      await api.delete(`/exercises/${exerciseId}`);
      alert(role === 'admin' ? 'Da xoa cung bai tap.' : 'Da xoa mem bai tap.');
      navigate(-1);
    } catch (err) {
      const apiMessage = err.response?.data?.message || err.message;
      alert('Loi xoa bai: ' + apiMessage);
    } finally {
      setDeletingExercise(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <button onClick={() => navigate(`/courses/${courseId}/skills/${skill}/exercises`)} style={styles.backBtn}>← Danh sách bài</button>
        <div style={styles.titleArea}>
          <h2 style={styles.title}>{exercise?.title || 'Bài tập'}</h2>
          <p style={styles.subtitle}>Kỹ năng: {String(skill || '').toUpperCase()} {!editMode && `| Thời gian còn lại: ${formatTime(secondsLeft)}`}</p>
        </div>
        <div style={styles.headerBtnGroup}>
          {isTeacherOrAdmin && (
            <button
              onClick={deleteCurrentExercise}
              disabled={deletingExercise || savingQuestions}
              style={styles.deleteBtn}
            >
              {deletingExercise ? 'Đang xóa...' : 'Xóa bài'}
            </button>
          )}
          {isTeacherOrAdmin && !editMode && (
            <button onClick={enterEditMode} style={styles.editModeBtn}>✏️ Chỉnh sửa</button>
          )}
          {editMode && (
            <>
              <button onClick={saveEditedQuestions} disabled={savingQuestions} style={styles.submitBtn}>{savingQuestions ? 'Lưu...' : 'Lưu câu hỏi'}</button>
              <button onClick={exitEditMode} disabled={savingQuestions} style={styles.cancelBtn}>Hủy</button>
            </>
          )}
          {!editMode && (
            <button
              onClick={handleSubmit}
              disabled={submitted || ((exercise?.skill_type === 'reading' || exercise?.skill_type === 'listening') && questions.length === 0)}
              style={styles.submitBtn}
            >
              Nộp bài
            </button>
          )}
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.leftCol}>
          {loading && <p style={styles.statusText}>Đang tải...</p>}
          {error && <p style={styles.errorText}>{error}</p>}

          {!loading && !error && (
            <>
              {isReading && readingPassage && (
                <div style={styles.passageCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={styles.sectionTitle}>Bài đọc</h3>
                    {isTeacherOrAdmin && editingField !== 'readingPassage' && !editMode && (
                      <button onClick={() => startEdit('readingPassage')} style={styles.editBtn}>✏️ Chỉnh sửa</button>
                    )}
                  </div>
                  {editingField === 'readingPassage' ? (
                    <div>
                      <textarea value={editValues.readingPassage} onChange={(e) => setEditValues((p) => ({ ...p, readingPassage: e.target.value }))} style={{ ...styles.editTextarea, minHeight: '180px' }} />
                      <div style={styles.editBtnGroup}>
                        <button onClick={saveEdit} disabled={savingEdit} style={styles.saveBtnSmall}>{savingEdit ? 'Lưu...' : 'Lưu'}</button>
                        <button onClick={cancelEdit} style={styles.cancelBtnSmall}>Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <p style={styles.passageText}>{readingPassage}</p>
                  )}
                </div>
              )}

              {isListening && (
                <div style={styles.passageCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={styles.sectionTitle}>Bài nghe</h3>
                    {isTeacherOrAdmin && editingField !== 'taskPrompt' && !editMode && (
                      <button onClick={() => startEdit('taskPrompt')} style={styles.editBtn}>✏️ Chỉnh sửa</button>
                    )}
                  </div>
                  {editingField === 'taskPrompt' ? (
                    <div>
                      <textarea value={editValues.taskPrompt} onChange={(e) => setEditValues((p) => ({ ...p, taskPrompt: e.target.value }))} style={styles.editTextarea} />
                      <div style={styles.editBtnGroup}>
                        <button onClick={saveEdit} disabled={savingEdit} style={styles.saveBtnSmall}>{savingEdit ? 'Lưu...' : 'Lưu'}</button>
                        <button onClick={cancelEdit} style={styles.cancelBtnSmall}>Hủy</button>
                      </div>
                    </div>
                  ) : (
                    taskPrompt && <p style={styles.passageText}>{taskPrompt}</p>
                  )}
                  {audioUrl ? (
                    <audio controls style={{ width: '100%' }} src={audioUrl} />
                  ) : (
                    <p style={styles.errorText}>Không tìm thấy file audio cho bài nghe này.</p>
                  )}
                </div>
              )}

              {isWriting && (
                <div style={styles.passageCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={styles.sectionTitle}>Đề bài viết</h3>
                    {isTeacherOrAdmin && editingField !== 'taskPrompt' && !editMode && (
                      <button onClick={() => startEdit('taskPrompt')} style={styles.editBtn}>✏️ Chỉnh sửa</button>
                    )}
                  </div>
                  {editingField === 'taskPrompt' ? (
                    <div>
                      <textarea value={editValues.taskPrompt} onChange={(e) => setEditValues((p) => ({ ...p, taskPrompt: e.target.value }))} style={styles.editTextarea} />
                      <div style={styles.editBtnGroup}>
                        <button onClick={saveEdit} disabled={savingEdit} style={styles.saveBtnSmall}>{savingEdit ? 'Lưu...' : 'Lưu'}</button>
                        <button onClick={cancelEdit} style={styles.cancelBtnSmall}>Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <p style={styles.passageText}>{taskPrompt || 'Chưa có đề bài.'}</p>
                  )}
                  {!isTeacherOrAdmin && (
                    <textarea
                      style={styles.writingBox}
                      placeholder='Nhập bài viết của bạn ở đây...'
                      value={textResponse}
                      onChange={(e) => setTextResponse(e.target.value)}
                      disabled={submitted}
                    />
                  )}
                  {isTeacherOrAdmin && (
                    <div style={{ marginTop: '10px' }}>
                      <label style={styles.label}>Bài mẫu:</label>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        {editingField !== 'sampleAnswer' && !editMode && (
                          <button onClick={() => startEdit('sampleAnswer')} style={styles.editBtn}>✏️ Chỉnh sửa bài mẫu</button>
                        )}
                      </div>
                      {editingField === 'sampleAnswer' ? (
                        <div>
                          <textarea value={editValues.sampleAnswer} onChange={(e) => setEditValues((p) => ({ ...p, sampleAnswer: e.target.value }))} style={{ ...styles.editTextarea, minHeight: '100px' }} />
                          <div style={styles.editBtnGroup}>
                            <button onClick={saveEdit} disabled={savingEdit} style={styles.saveBtnSmall}>{savingEdit ? 'Lưu...' : 'Lưu'}</button>
                            <button onClick={cancelEdit} style={styles.cancelBtnSmall}>Hủy</button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ ...styles.passageText, background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>{exercise?.sample_answer || 'Chưa có bài mẫu.'}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isSpeaking && (
                <div style={styles.passageCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={styles.sectionTitle}>Đề bài nói</h3>
                    {isTeacherOrAdmin && editingField !== 'taskPrompt' && !editMode && (
                      <button onClick={() => startEdit('taskPrompt')} style={styles.editBtn}>✏️ Chỉnh sửa</button>
                    )}
                  </div>
                  {editingField === 'taskPrompt' ? (
                    <div>
                      <textarea value={editValues.taskPrompt} onChange={(e) => setEditValues((p) => ({ ...p, taskPrompt: e.target.value }))} style={styles.editTextarea} />
                      <div style={styles.editBtnGroup}>
                        <button onClick={saveEdit} disabled={savingEdit} style={styles.saveBtnSmall}>{savingEdit ? 'Lưu...' : 'Lưu'}</button>
                        <button onClick={cancelEdit} style={styles.cancelBtnSmall}>Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <p style={styles.passageText}>{taskPrompt || 'Chưa có đề bài.'}</p>
                  )}
                  {!isTeacherOrAdmin && (
                    <>
                      <div style={styles.recordRow}>
                        {!isRecording ? (
                          <button type="button" onClick={startRecording} style={styles.micBtn} disabled={submitted}>🎤 Bắt đầu thu</button>
                        ) : (
                          <button type="button" onClick={stopRecording} style={styles.stopBtn}>⏹ Dừng thu</button>
                        )}
                        {isRecording && <span style={styles.recText}>Đang ghi âm...</span>}
                      </div>
                      {recordedUrl && (
                        <audio controls style={{ width: '100%', marginTop: '10px' }} src={recordedUrl} />
                      )}
                      {recorderError && <p style={styles.errorText}>{recorderError}</p>}
                    </>
                  )}
                  {isTeacherOrAdmin && (
                    <div style={{ marginTop: '10px' }}>
                      <label style={styles.label}>Bài mẫu:</label>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        {editingField !== 'sampleAnswer' && !editMode && (
                          <button onClick={() => startEdit('sampleAnswer')} style={styles.editBtn}>✏️ Chỉnh sửa bài mẫu</button>
                        )}
                      </div>
                      {editingField === 'sampleAnswer' ? (
                        <div>
                          <textarea value={editValues.sampleAnswer} onChange={(e) => setEditValues((p) => ({ ...p, sampleAnswer: e.target.value }))} style={{ ...styles.editTextarea, minHeight: '100px' }} />
                          <div style={styles.editBtnGroup}>
                            <button onClick={saveEdit} disabled={savingEdit} style={styles.saveBtnSmall}>{savingEdit ? 'Lưu...' : 'Lưu'}</button>
                            <button onClick={cancelEdit} style={styles.cancelBtnSmall}>Hủy</button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ ...styles.passageText, background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>{exercise?.sample_answer || 'Chưa có bài mẫu.'}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {editMode && (
                <div style={styles.editModePanel}>
                  <div style={styles.editModeHeader}>
                    <h3 style={styles.sectionTitle}>Chế độ chỉnh sửa</h3>
                    <p style={styles.editModeNote}>Các câu trả lời và gợi ý hiển thị dưới đây. Bạn có thể chỉnh sửa các giá trị trực tiếp.</p>
                  </div>

                  {isReading && readingPassage && (
                    <div style={styles.editSection}>
                      <h4 style={styles.editSectionTitle}>Bài đọc</h4>
                      <textarea
                        value={editFormData.readingPassage}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, readingPassage: e.target.value }))}
                        style={{ ...styles.editTextarea, minHeight: '120px' }}
                      />
                    </div>
                  )}

                  {isListening && (
                    <div style={styles.editSection}>
                      <h4 style={styles.editSectionTitle}>Hướng dẫn bài nghe</h4>
                      <textarea
                        value={exercise?.task_prompt || ''}
                        disabled={true}
                        style={{ ...styles.editTextarea, minHeight: '80px', background: '#f8fafc', color: '#666' }}
                      />
                      <p style={styles.editNote}>* Bài nghe không thể chỉnh sửa. Hãy tải lại file audio nếu cần thay đổi.</p>
                      {audioUrl && (
                        <div style={styles.editSection}>
                          <p style={styles.editSectionTitle}>File nghe hiện tại:</p>
                          <audio controls style={{ width: '100%' }} src={audioUrl} />
                        </div>
                      )}
                    </div>
                  )}

                  {isWriting && (
                    <div style={styles.editSection}>
                      <h4 style={styles.editSectionTitle}>Đề bài viết</h4>
                      <textarea
                        value={exercise?.task_prompt || ''}
                        disabled={true}
                        style={{ ...styles.editTextarea, minHeight: '80px', background: '#f8fafc', color: '#666' }}
                      />
                      <h4 style={{ ...styles.editSectionTitle, marginTop: '16px' }}>Bài mẫu</h4>
                      <textarea
                        value={editFormData.sampleAnswer}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, sampleAnswer: e.target.value }))}
                        style={{ ...styles.editTextarea, minHeight: '100px' }}
                      />
                    </div>
                  )}

                  {isSpeaking && (
                    <div style={styles.editSection}>
                      <h4 style={styles.editSectionTitle}>Đề bài nói</h4>
                      <textarea
                        value={exercise?.task_prompt || ''}
                        disabled={true}
                        style={{ ...styles.editTextarea, minHeight: '80px', background: '#f8fafc', color: '#666' }}
                      />
                      <h4 style={{ ...styles.editSectionTitle, marginTop: '16px' }}>Bài mẫu</h4>
                      <textarea
                        value={editFormData.sampleAnswer}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, sampleAnswer: e.target.value }))}
                        style={{ ...styles.editTextarea, minHeight: '100px' }}
                      />
                    </div>
                  )}

                  {(isReading || isListening) && (
                    <div style={styles.editSection}>
                      <h3 style={styles.sectionTitle}>Chỉnh sửa câu hỏi</h3>
                      {editQuestions.map((q, idx) => (
                        <div key={idx} style={styles.editQuestionBlock}>
                          <div style={styles.editQuestionLabel}>{idx + 1}. Câu hỏi</div>
                          <input
                            type='text'
                            value={q.question}
                            onChange={(e) => updateEditQuestion(idx, 'question', e.target.value)}
                            style={styles.editInput}
                          />
                          <div style={styles.editQuestionLabel}>Lựa chọn</div>
                          {(q.options || []).map((opt, optIdx) => (
                            <input
                              key={optIdx}
                              type='text'
                              value={opt}
                              onChange={(e) => updateEditQuestion(idx, 'option', { optionIndex: optIdx, text: e.target.value })}
                              style={styles.editInput}
                              placeholder={`Lựa chọn ${String.fromCharCode(65 + optIdx)}`}
                            />
                          ))}
                          <div style={styles.editQuestionLabel}>Đáp án đúng</div>
                          <select
                            value={q.correctAnswer || ''}
                            onChange={(e) => updateEditQuestion(idx, 'correctAnswer', e.target.value)}
                            style={styles.editSelect}
                          >
                            <option value=''>-- Chọn đáp án --</option>
                            {(q.options || []).map((opt, optIdx) => (
                              <option key={optIdx} value={opt}>{opt}</option>
                            ))}
                          </select>
                          <div style={styles.editQuestionLabel}>Gợi ý / Giải thích</div>
                          <textarea
                            value={q.explanation || ''}
                            onChange={(e) => updateEditQuestion(idx, 'explanation', e.target.value)}
                            style={{ ...styles.editTextarea, minHeight: '60px' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(isReading || isListening) && !editMode && (
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
              )}
            </>
          )}
        </div>

        <div style={styles.rightCol}>
          <div style={styles.panelCard}>
            <h4 style={styles.panelTitle}>Điều hướng câu hỏi</h4>
            {(isReading || isListening) && (
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
            )}
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
    gridTemplateColumns: '180px 1fr auto',
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
  editModePanel: { background: '#fff', borderRadius: '12px', padding: '20px', border: '2px solid #2563eb', marginBottom: '14px' },
  editModeHeader: { marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' },
  editModeNote: { margin: '8px 0 0 0', color: '#666', fontSize: '14px', fontStyle: 'italic' },
  editSection: { marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f0f0f0' },
  editSectionTitle: { margin: '0 0 10px 0', color: '#0f172a', fontSize: '15px', fontWeight: '600' },
  editNote: { margin: '8px 0 0 0', color: '#888', fontSize: '12px', fontStyle: 'italic', background: '#f9fafb', padding: '8px', borderRadius: '6px' },
  questionsCard: { background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' },
  sectionTitle: { marginTop: 0, color: '#0f172a' },
  passageText: { whiteSpace: 'pre-line', lineHeight: 1.6, color: '#334155' },
  writingBox: {
    width: '100%',
    minHeight: '180px',
    marginTop: '10px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    padding: '10px',
    fontSize: '14px',
    lineHeight: 1.5,
    boxSizing: 'border-box'
  },
  recordRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  micBtn: { border: 'none', background: '#0f766e', color: '#fff', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', fontWeight: '700' },
  stopBtn: { border: 'none', background: '#b91c1c', color: '#fff', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', fontWeight: '700' },
  recText: { color: '#b91c1c', fontWeight: '700' },
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
  errorText: { textAlign: 'center', padding: '24px', color: '#dc2626' },
  editBtn: { border: '1px solid #1f7a8c', background: '#f8fbff', color: '#1f7a8c', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
  editTextarea: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'sans-serif', fontSize: '14px', lineHeight: 1.5, boxSizing: 'border-box', minHeight: '80px', resize: 'vertical' },
  editBtnGroup: { display: 'flex', gap: '8px', marginTop: '8px' },
  saveBtnSmall: { border: 'none', background: '#059669', color: '#fff', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
  cancelBtnSmall: { border: '1px solid #cbd5e1', background: '#fff', color: '#475569', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
  label: { display: 'block', marginBottom: '6px', color: '#555', fontWeight: '600', fontSize: '13px' },
  headerBtnGroup: { display: 'flex', gap: '8px', alignItems: 'center' },
  editModeBtn: { border: '1px solid #1f7a8c', background: '#f8fbff', color: '#1f7a8c', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  deleteBtn: { border: '1px solid #dc2626', background: '#fff5f5', color: '#b91c1c', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' },
  cancelBtn: { border: '1px solid #cbd5e1', background: '#fff', color: '#475569', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  editQuestionBlock: { borderTop: '1px solid #e5e7eb', paddingTop: '14px', marginTop: '14px', padding: '14px', background: '#f9fafb', borderRadius: '8px' },
  editQuestionLabel: { marginTop: '10px', marginBottom: '6px', fontWeight: '600', color: '#333', fontSize: '13px' },
  editInput: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', lineHeight: 1.5, boxSizing: 'border-box', marginBottom: '8px' },
  editSelect: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', marginBottom: '8px' }
};

export default ExerciseAttemptPage;
