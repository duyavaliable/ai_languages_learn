import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SKILL_OPTIONS = [
  { value: 'reading', label: 'Đọc' },
  { value: 'listening', label: 'Nghe' },
  { value: 'writing', label: 'Viết' },
  { value: 'speaking', label: 'Nói' }
];

const defaultCourse = {
  language_id: '',
  name: '',
  description: '',
  level: 'A2',
  duration: ''
};

const defaultLesson = {
  course_id: '',
  title: '',
  content: '',
  lesson_order: 1
};

const defaultExercise = {
  course_id: '',
  lesson_id: '',
  title: '',
  skill: 'reading',
  cefrLevel: 'A2',
  topic: '',
  count: 5
};

const defaultVocabulary = {
  course_id: '',
  lesson_id: '',
  word: '',
  pronunciation: '',
  meaning: '',
  example_sentence: '',
  example_translation: ''
};

const toCefrLevel = (value) => String(value || '').trim().toUpperCase();

function TeacherCreateContent() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [mode, setMode] = useState('course');

  const [languages, setLanguages] = useState([]);
  const [courses, setCourses] = useState([]);
  const [exerciseLessons, setExerciseLessons] = useState([]);
  const [vocabularyLessons, setVocabularyLessons] = useState([]);
  const [vocabularies, setVocabularies] = useState([]);
  const [vocabularyFile, setVocabularyFile] = useState(null);
  const [vocabularyPreviewRows, setVocabularyPreviewRows] = useState([]);
  const [vocabularyPreviewRaw, setVocabularyPreviewRaw] = useState('');
  const [vocabularyParseMeta, setVocabularyParseMeta] = useState(null);
  const [vocabularyUseAiValidation, setVocabularyUseAiValidation] = useState(false);
  const [vocabularyPreviewLoading, setVocabularyPreviewLoading] = useState(false);
  const [vocabularySaveLoading, setVocabularySaveLoading] = useState(false);

  const [courseForm, setCourseForm] = useState(defaultCourse);
  const [lessonForm, setLessonForm] = useState(defaultLesson);
  const [exerciseForm, setExerciseForm] = useState(defaultExercise);
  const [vocabularyForm, setVocabularyForm] = useState(defaultVocabulary);

  const [message, setMessage] = useState(null);
  const [createdExerciseInfos, setCreatedExerciseInfos] = useState([]);
  const [listeningAudioFile, setListeningAudioFile] = useState(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [editFeedback, setEditFeedback] = useState('');
  const [refineLoading, setRefineLoading] = useState(false);
  const [exerciseLessonLoading, setExerciseLessonLoading] = useState(false);
  const [exerciseFile, setExerciseFile] = useState(null);
  const [exerciseParts, setExerciseParts] = useState([]);
  const [exercisePreviewLoading, setExercisePreviewLoading] = useState(false);
  const [exerciseSelectedParts, setExerciseSelectedParts] = useState([]);
  const [vocabularyLessonLoading, setVocabularyLessonLoading] = useState(false);
  const [vocabularyLoading, setVocabularyLoading] = useState(false);
  const [vocabularyMsg, setVocabularyMsg] = useState(null);
  const [vocabularyPreviewMsg, setVocabularyPreviewMsg] = useState(null);
  const [editingVocabulary, setEditingVocabulary] = useState(null);
  const [selectedPartForDetail, setSelectedPartForDetail] = useState(null);

  useEffect(() => {
    if (currentUser.role !== 'teacher') {
      navigate('/');
      return;
    }

    api.get('/languages').then((res) => setLanguages(res.data)).catch(() => {});
    fetchCourses();
  }, []);

  const fetchCourses = () => {
    api.get('/courses').then((res) => setCourses(res.data)).catch(() => {});
  };

  const fetchLessonsForCourse = (courseId, setLessons, setLoading) => {
    if (!courseId) {
      setLessons([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.get(`/lessons?courseId=${courseId}`)
      .then((res) => setLessons(res.data || []))
      .catch(() => setLessons([]))
      .finally(() => setLoading(false));
  };

  const fetchVocabulary = (lessonId) => {
    if (!lessonId) {
      setVocabularies([]);
      setVocabularyLoading(false);
      return;
    }

    setVocabularyLoading(true);
    api.get(`/vocabulary?lessonId=${lessonId}`)
      .then((res) => setVocabularies(res.data || []))
      .catch(() => setVocabularies([]))
      .finally(() => setVocabularyLoading(false));
  };

  const resetVocabularyPreview = () => {
    setVocabularyFile(null);
    setVocabularyPreviewRows([]);
    setVocabularyPreviewRaw('');
    setVocabularyParseMeta(null);
    setVocabularyPreviewMsg(null);
  };

  const lessonLabel = (lesson) => {
    if (!lesson) return '';
    const prefix = lesson.lesson_order ? `Lesson ${lesson.lesson_order}` : 'Lesson';
    return `${prefix}: ${lesson.title}`;
  };

  const syncExerciseLesson = (courseId, lessonId = '') => {
    const courseLessons = exerciseLessons.length > 0 ? exerciseLessons : [];
    const lesson = courseLessons.find((item) => String(item.id) === String(lessonId));
    setExerciseForm((prev) => ({
      ...prev,
      course_id: courseId,
      lesson_id: lessonId,
      title: lesson ? lessonLabel(lesson) : '',
      topic: lesson ? lesson.title : ''
    }));
  };

  const syncVocabularyLesson = (courseId, lessonId = '') => {
    setVocabularyForm((prev) => ({
      ...prev,
      course_id: courseId,
      lesson_id: lessonId
    }));
  };

  const showMsg = (type, text) => setMessage({ type, text });

  const isLikelyEnglishWord = (value) => {
    const text = String(value || '').trim();
    if (!text) return false;
    const normalized = text
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[\u2013\u2014]/g, '-');
    return /^[A-Za-z][A-Za-z'\-\s]*$/.test(normalized);
  };

  const isLikelySuspiciousVocabularyRow = (item) => {
    const word = String(item?.word || '').trim();
    const meaning = String(item?.meaning || '').trim();
    return !isLikelyEnglishWord(word) && Boolean(word || meaning);
  };

  const speakWord = (word) => {
    const value = String(word || '').trim();
    if (!value) return;
    if (!isLikelyEnglishWord(value)) {
      setVocabularyPreviewMsg({ type: 'error', text: 'Dòng này không giống từ tiếng Anh nên hệ thống không đọc để tránh phát âm sai.' });
      return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setVocabularyPreviewMsg({ type: 'error', text: 'Trình duyệt không hỗ trợ phát âm tự động.' });
      return;
    }

    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const submitCourse = async (e) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.post('/courses/teacher-create', {
        ...courseForm,
        duration: courseForm.duration === '' ? null : Number(courseForm.duration)
      });
      setCourseForm(defaultCourse);
      fetchCourses();
      showMsg('success', 'Tạo course thành công');
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Tạo course thất bại');
    }
  };

  const submitLesson = async (e) => {
    e.preventDefault();
    setMessage(null);
    try {
      const createdCourseId = lessonForm.course_id;
      await api.post('/lessons/teacher-create', {
        ...lessonForm,
        lesson_order: Number(lessonForm.lesson_order || 1)
      });
      setLessonForm((prev) => ({ ...defaultLesson, course_id: prev.course_id }));
      fetchCourses();
      if (String(exerciseForm.course_id) === String(createdCourseId)) {
        fetchLessonsForCourse(createdCourseId, setExerciseLessons, setExerciseLessonLoading);
      }
      if (String(vocabularyForm.course_id) === String(createdCourseId)) {
        fetchLessonsForCourse(createdCourseId, setVocabularyLessons, setVocabularyLessonLoading);
      }
      showMsg('success', 'Tạo chủ đề thành công');
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Tạo chủ đề thất bại');
    }
  };

  const submitExercise = async (e) => {
    e.preventDefault();
    setMessage(null);

    const manualTitle = String(exerciseForm.title || '').trim();
    if (!manualTitle) {
      showMsg('error', 'Vui lòng nhập tên bài trước khi tạo exercise.');
      return;
    }

    setGenerateLoading(true);
    try {
      const createdItems = [];

      const selectedParts = exerciseParts.length > 0
        ? (exerciseSelectedParts.length > 0
            ? exerciseSelectedParts
                .map((partIndex) => ({ partIndex, part: exerciseParts[partIndex] }))
                .filter((item) => Boolean(item.part))
            : exerciseParts.map((part, partIndex) => ({ partIndex, part })))
        : [];

      if (selectedParts.length === 0) {
        const formData = new FormData();
        formData.append('course_id', String(Number(exerciseForm.course_id)));
        formData.append('exerciseTitle', manualTitle);
        formData.append('skill', exerciseForm.skill);
        formData.append('cefrLevel', exerciseForm.cefrLevel);
        formData.append('topic', String(exerciseForm.topic || '').trim());
        formData.append('count', String(Number(exerciseForm.count || 5)));

        if (exerciseForm.skill === 'listening') {
          if (!listeningAudioFile) {
            showMsg('error', 'Vui lòng tải file audio cho bài nghe.');
            return;
          }
          formData.append('audioFile', listeningAudioFile);
        }

        const res = await api.post('/ai/teacher/generate-exercises', formData, {
          timeout: 90000
        });

        createdItems.push({
          exerciseId: res.data?.exerciseId,
          exerciseTitle: res.data?.exerciseTitle || manualTitle,
          audioUrl: res.data?.audioUrl || null,
          exerciseSet: res.data?.exerciseSet || null,
          skill: exerciseForm.skill,
          questionCount: Array.isArray(res.data?.exerciseSet?.questions) ? res.data.exerciseSet.questions.length : 0
        });
      } else {
        for (const { part } of selectedParts) {
          const formData = new FormData();
          formData.append('course_id', String(Number(exerciseForm.course_id)));
          formData.append('exerciseTitle', manualTitle);
          formData.append('skill', exerciseForm.skill);
          formData.append('cefrLevel', exerciseForm.cefrLevel);
          formData.append('topic', String(part.content || part.title || '').trim());
          formData.append('count', String(Number(exerciseForm.count || 5)));

          if (exerciseForm.skill === 'listening') {
            if (!listeningAudioFile) {
              showMsg('error', 'Vui lòng tải file audio cho bài nghe.');
              return;
            }
            formData.append('audioFile', listeningAudioFile);
          }

          const res = await api.post('/ai/teacher/generate-exercises', formData, {
            timeout: 90000
          });

          createdItems.push({
            exerciseId: res.data?.exerciseId,
            exerciseTitle: res.data?.exerciseTitle || manualTitle,
            audioUrl: res.data?.audioUrl || null,
            exerciseSet: res.data?.exerciseSet || null,
            skill: exerciseForm.skill,
            questionCount: Array.isArray(res.data?.exerciseSet?.questions) ? res.data.exerciseSet.questions.length : 0
          });
        }
      }

      setCreatedExerciseInfos(createdItems);
      setListeningAudioFile(null);
      setEditFeedback('');
      showMsg('success', `AI đã tạo và lưu ${createdItems.length} bài tập vào kho bài tập.`);
    } catch (err) {
      const detail = err?.response?.data?.message || err?.message || 'Tạo exercise thất bại';
      console.error('[TeacherCreateContent] Exercise generation failed', {
        request: {
          course_id: Number(exerciseForm.course_id),
          skill: exerciseForm.skill,
          cefrLevel: exerciseForm.cefrLevel,
          topic: exerciseParts.map((part) => part.title).join(', '),
          count: Number(exerciseForm.count || 5)
        },
        status: err?.response?.status,
        data: err?.response?.data,
        message: detail
      });

      if (err?.code === 'ECONNABORTED') {
        showMsg('error', 'Tạo exercise thất bại do quá thời gian chờ (timeout). Kiểm tra terminal backend để xem AI có còn đang xử lý không.');
      } else {
        showMsg('error', 'Tạo exercise thất bại. Xem terminal để biết chi tiết lỗi.');
      }
    } finally {
      setGenerateLoading(false);
    }
  };

  const refineExercise = async () => {
    const currentExercise = createdExerciseInfos[0];
    if (!currentExercise?.exerciseId) return;
    if (!editFeedback.trim()) {
      showMsg('error', 'Vui lòng nhập yêu cầu chỉnh sửa cho AI.');
      return;
    }

    try {
      setRefineLoading(true);
      const res = await api.post('/ai/teacher/refine-exercise', {
        exerciseId: currentExercise.exerciseId,
        feedback: editFeedback
      });

      setCreatedExerciseInfos((prev) => prev.map((item, index) => (
        index === 0 ? {
          ...item,
          exerciseSet: res.data?.exerciseSet || item?.exerciseSet,
          exerciseTitle: res.data?.exerciseTitle || item?.exerciseTitle,
          questionCount: Array.isArray(res.data?.exerciseSet?.questions) ? res.data.exerciseSet.questions.length : item?.questionCount
        } : item
      )));
      setEditFeedback('');
      showMsg('success', 'AI đã chỉnh sửa bài theo yêu cầu của giáo viên.');
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Không thể chỉnh sửa bài bằng AI');
    } finally {
      setRefineLoading(false);
    }
  };

  const resetExerciseDraft = () => {
    setCreatedExerciseInfos([]);
    setEditFeedback('');
    setListeningAudioFile(null);
    setExerciseForm(defaultExercise);
    setExerciseFile(null);
    setExerciseParts([]);
    setExerciseSelectedParts([]);
  };

  const handleExerciseCourseChange = (courseId) => {
    const selectedCourse = courses.find((course) => String(course.id) === String(courseId));
    const level = toCefrLevel(selectedCourse?.level);
    setExerciseForm((prev) => ({
      ...prev,
      course_id: courseId,
      title: '',
      topic: '',
      cefrLevel: CEFR_LEVELS.includes(level) ? level : prev.cefrLevel
    }));
  };

  const handleVocabularyCourseChange = (courseId) => {
    setVocabularyForm((prev) => ({
      ...prev,
      course_id: courseId,
      lesson_id: '',
      word: '',
      pronunciation: '',
      meaning: '',
      example_sentence: '',
      example_translation: ''
    }));
    setVocabularyLessons([]);
    setVocabularies([]);
    resetVocabularyPreview();
    fetchLessonsForCourse(courseId, setVocabularyLessons, setVocabularyLessonLoading);
  };

  const handleVocabularyLessonChange = (lessonId) => {
    setVocabularyForm((prev) => ({
      ...prev,
      lesson_id: lessonId
    }));
    resetVocabularyPreview();
    fetchVocabulary(lessonId);
  };

  const handleVocabularyFileChange = (file) => {
    setVocabularyFile(file || null);
    setVocabularyPreviewRows([]);
    setVocabularyPreviewRaw('');
    setVocabularyParseMeta(null);
    setVocabularyPreviewMsg(null);
  };

  const handleExerciseFileChange = (file) => {
    setExerciseFile(file || null);
    setExerciseParts([]);
    setExerciseSelectedParts([]);
  };

  const previewExerciseFile = async () => {
    if (!exerciseFile) {
      showMsg('error', 'Vui lòng chọn file PDF hoặc DOCX.');
      return;
    }
    setExercisePreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', exerciseFile);
      const res = await api.post('/exercises/preview-parts', formData, { timeout: 90000 });
      const parts = Array.isArray(res.data?.parts) ? res.data.parts : [];
      setExerciseParts(parts);
      setExerciseSelectedParts(parts.map((_part, index) => index));
      if (parts.length === 0) {
        showMsg('info', 'Không tìm thấy phần (PART) trong tài liệu.');
      } else {
        showMsg('success', `Tìm thấy ${parts.length} phần. Chọn phần để sử dụng cho bài tập.`);
      }
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Không thể quét file cho exercise');
    } finally {
      setExercisePreviewLoading(false);
    }
  };

  const previewVocabularyFile = async () => {
    if (!vocabularyFile) {
      setVocabularyPreviewMsg({ type: 'error', text: 'Vui lòng chọn file PDF, DOCX hoặc TXT.' });
      return;
    }

    setVocabularyPreviewLoading(true);
    setVocabularyPreviewMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', vocabularyFile);
      formData.append('validateWithAI', String(vocabularyUseAiValidation));
      const res = await api.post('/vocabulary/preview', formData, {
        timeout: 90000
      });

      setVocabularyPreviewRows(Array.isArray(res.data?.items) ? res.data.items : []);
      setVocabularyPreviewRaw(res.data?.rawText || '');
      setVocabularyParseMeta({
        fileType: res.data?.fileType || 'unknown',
        source: res.data?.source || 'unknown',
        usedTable: Boolean(res.data?.usedTable),
        totalRows: Number(res.data?.totalRows || 0),
        aiValidationApplied: Boolean(res.data?.aiValidationApplied),
        aiWarnings: Array.isArray(res.data?.aiWarnings) ? res.data.aiWarnings : []
      });
      setVocabularyPreviewMsg({
        type: 'success',
        text: `Đã quét ${res.data?.totalWords ?? res.data?.totalRows ?? 0} từ từ file. Hãy kiểm tra lại bảng preview trước khi lưu.`
      });
    } catch (err) {
      setVocabularyPreviewMsg({ type: 'error', text: err.response?.data?.message || 'Không quét được file từ vựng' });
    } finally {
      setVocabularyPreviewLoading(false);
    }
  };

  const updatePreviewRow = (index, field, value) => {
    setVocabularyPreviewRows((prev) => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const removePreviewRow = (index) => {
    setVocabularyPreviewRows((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const importPreviewVocabulary = async () => {
    if (!vocabularyForm.lesson_id) {
      setVocabularyPreviewMsg({ type: 'error', text: 'Vui lòng chọn lesson trước khi lưu.' });
      return;
    }

    const normalizedItems = vocabularyPreviewRows
      .map((item) => ({
        word: String(item.word || '').trim(),
        pronunciation: String(item.pronunciation || '').trim(),
        meaning: String(item.meaning || '').trim(),
        example_sentence: String(item.example_sentence || '').trim(),
        example_translation: String(item.example_translation || '').trim()
      }))
      .filter((item) => item.word && item.meaning);

    if (normalizedItems.length === 0) {
      setVocabularyPreviewMsg({ type: 'error', text: 'Không có dòng hợp lệ để lưu.' });
      return;
    }

    setVocabularySaveLoading(true);
    try {
      await api.post('/vocabulary/import-batch', {
        lesson_id: Number(vocabularyForm.lesson_id),
        items: normalizedItems
      });

      setVocabularyMsg({ type: 'success', text: `Đã lưu ${normalizedItems.length} từ vựng từ file.` });
      setVocabularyPreviewMsg({ type: 'success', text: 'Lưu thành công. Bảng preview đã được làm mới.' });
      resetVocabularyPreview();
      fetchVocabulary(vocabularyForm.lesson_id);
    } catch (err) {
      setVocabularyPreviewMsg({ type: 'error', text: err.response?.data?.message || 'Lưu từ vựng từ file thất bại' });
    } finally {
      setVocabularySaveLoading(false);
    }
  };

  const handleEditVocabulary = (item) => {
    setEditingVocabulary(item.id);
    const nextCourseId = item.lesson?.course_id ? String(item.lesson.course_id) : '';
    const nextLessonId = item.lesson_id ? String(item.lesson_id) : '';
    setVocabularyForm({
      course_id: nextCourseId,
      lesson_id: nextLessonId,
      word: item.word || '',
      pronunciation: item.pronunciation || '',
      meaning: item.meaning || '',
      example_sentence: item.example_sentence || '',
      example_translation: item.example_translation || ''
    });
    setMode('vocabulary');
    if (nextCourseId) {
      fetchLessonsForCourse(nextCourseId, setVocabularyLessons, setVocabularyLessonLoading);
    }
    if (nextLessonId) {
      fetchVocabulary(nextLessonId);
    }
  };

  const resetVocabularyDraft = () => {
    setEditingVocabulary(null);
    setVocabularyForm((prev) => ({
      ...defaultVocabulary,
      course_id: prev.course_id,
      lesson_id: prev.lesson_id
    }));
  };

  const submitVocabulary = async (e) => {
    e.preventDefault();
    setVocabularyMsg(null);

    if (!vocabularyForm.lesson_id || !vocabularyForm.word.trim() || !vocabularyForm.meaning.trim()) {
      setVocabularyMsg({ type: 'error', text: 'Vui lòng chọn lesson và nhập từ + nghĩa.' });
      return;
    }

    try {
      const payload = {
        lesson_id: Number(vocabularyForm.lesson_id),
        word: vocabularyForm.word,
        pronunciation: vocabularyForm.pronunciation,
        meaning: vocabularyForm.meaning,
        example_sentence: vocabularyForm.example_sentence,
        example_translation: vocabularyForm.example_translation
      };

      if (editingVocabulary) {
        await api.put(`/vocabulary/${editingVocabulary}`, payload);
        setVocabularyMsg({ type: 'success', text: 'Cập nhật từ vựng thành công' });
      } else {
        await api.post('/vocabulary', payload);
        setVocabularyMsg({ type: 'success', text: 'Tạo từ vựng thành công' });
      }

      fetchVocabulary(vocabularyForm.lesson_id);
      setEditingVocabulary(null);
      setVocabularyForm((prev) => ({
        ...defaultVocabulary,
        course_id: prev.course_id,
        lesson_id: prev.lesson_id
      }));
    } catch (err) {
      setVocabularyMsg({ type: 'error', text: err.response?.data?.message || 'Lưu từ vựng thất bại' });
    }
  };

  const selectedVocabularyLesson = vocabularyLessons.find((lesson) => String(lesson.id) === String(vocabularyForm.lesson_id));

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={() => navigate('/')} style={styles.backBtn}>← Quay lại</button>
          <span style={styles.logo}>🧑‍🏫 Teacher Content Creator</span>
        </div>
        <span style={styles.welcomeText}>Giáo viên: <strong>{currentUser.username}</strong></span>
      </div>

      <div style={styles.content}>
        {message && <div style={message.type === 'success' ? styles.successBanner : styles.errorBanner}>{message.text}</div>}

        <div style={styles.modeBar}>
          <button
            onClick={() => setMode('course')}
            style={mode === 'course' ? styles.modeBtnActive : styles.modeBtn}
          >
            Tạo Course
          </button>
          <button
            onClick={() => setMode('lesson')}
            style={mode === 'lesson' ? styles.modeBtnActive : styles.modeBtn}
          >
            Tạo Lesson
          </button>
          <button
            onClick={() => setMode('vocabulary')}
            style={mode === 'vocabulary' ? styles.modeBtnActive : styles.modeBtn}
          >
            Tạo Vocabulary
          </button>
          <button
            onClick={() => setMode('exercise')}
            style={mode === 'exercise' ? styles.modeBtnActive : styles.modeBtn}
          >
            Tạo Exercise
          </button>
        </div>

        {mode === 'course' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Tạo Course</h3>
            <form onSubmit={submitCourse}>
              <label style={styles.label}>Tên course</label>
              <input style={styles.input} value={courseForm.name} onChange={(e) => setCourseForm((p) => ({ ...p, name: e.target.value }))} required />

              <label style={styles.label}>Ngôn ngữ</label>
              <select style={styles.input} value={courseForm.language_id} onChange={(e) => setCourseForm((p) => ({ ...p, language_id: e.target.value }))} required>
                <option value="">-- Chọn ngôn ngữ --</option>
                {languages.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>

              <label style={styles.label}>Level</label>
              <select style={styles.input} value={courseForm.level} onChange={(e) => setCourseForm((p) => ({ ...p, level: e.target.value }))}>
                {CEFR_LEVELS.map((lv) => (
                  <option key={lv} value={lv}>{lv}</option>
                ))}
              </select>

              <label style={styles.label}>Duration (hours)</label>
              <input type="number" style={styles.input} value={courseForm.duration} onChange={(e) => setCourseForm((p) => ({ ...p, duration: e.target.value }))} />

              <label style={styles.label}>Mô tả</label>
              <textarea style={{ ...styles.input, height: '80px', resize: 'vertical' }} value={courseForm.description} onChange={(e) => setCourseForm((p) => ({ ...p, description: e.target.value }))} />

              <button type="submit" style={styles.submitBtn}>Tạo Course</button>
            </form>
          </div>
        )}

        {mode === 'lesson' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Tạo Lesson / Chủ đề</h3>
            <form onSubmit={submitLesson}>
              <label style={styles.label}>Course</label>
              <select style={styles.input} value={lessonForm.course_id} onChange={(e) => setLessonForm((p) => ({ ...p, course_id: e.target.value }))} required>
                <option value="">-- Chọn course --</option>
                {courses.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>

              <label style={styles.label}>Tên lesson / chủ đề</label>
              <input style={styles.input} value={lessonForm.title} onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))} required />

              <label style={styles.label}>Thứ tự</label>
              <input type="number" min="1" style={styles.input} value={lessonForm.lesson_order} onChange={(e) => setLessonForm((p) => ({ ...p, lesson_order: e.target.value }))} />

              <label style={styles.label}>Nội dung</label>
              <textarea style={{ ...styles.input, height: '80px', resize: 'vertical' }} value={lessonForm.content} onChange={(e) => setLessonForm((p) => ({ ...p, content: e.target.value }))} />

              <button type="submit" style={styles.submitBtn}>Tạo Chủ đề</button>
            </form>
          </div>
        )}

        {mode === 'vocabulary' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Tạo / cập nhật Vocabulary</h3>
            <p style={styles.hintText}>Upload file PDF hoặc DOCX, hệ thống sẽ quét nội dung và cho bạn xem trước dưới dạng bảng.</p>

            {vocabularyMsg && <div style={vocabularyMsg.type === 'success' ? styles.successBanner : styles.errorBanner}>{vocabularyMsg.text}</div>}
            {vocabularyPreviewMsg && <div style={vocabularyPreviewMsg.type === 'success' ? styles.successBanner : styles.errorBanner}>{vocabularyPreviewMsg.text}</div>}
            {vocabularyLessonLoading && <p style={styles.statusText}>Đang tải lesson...</p>}

            <div style={styles.uploadBox}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={styles.label}>Course</label>
                  <select
                    style={styles.input}
                    value={vocabularyForm.course_id}
                    onChange={(e) => handleVocabularyCourseChange(e.target.value)}
                    required
                  >
                    <option value="">-- Chọn course --</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>{course.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Lesson / chủ đề</label>
                  <select
                    style={styles.input}
                    value={vocabularyForm.lesson_id}
                    onChange={(e) => handleVocabularyLessonChange(e.target.value)}
                    disabled={!vocabularyForm.course_id || vocabularyLessonLoading}
                    required
                  >
                    <option value="">-- Chọn lesson --</option>
                    {vocabularyLessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>{lessonLabel(lesson)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label style={styles.label}>File từ vựng (PDF, DOCX, TXT)</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                style={styles.input}
                onChange={(e) => handleVocabularyFileChange(e.target.files?.[0] || null)}
              />
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={vocabularyUseAiValidation}
                  onChange={(e) => setVocabularyUseAiValidation(e.target.checked)}
                />
                <span>Dùng AI validation (tùy chọn) để rà soát cột English / Phiên âm / Nghĩa</span>
              </label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button type="button" onClick={previewVocabularyFile} style={styles.submitBtn} disabled={vocabularyPreviewLoading || !vocabularyFile}>
                  {vocabularyPreviewLoading ? 'Đang quét file...' : 'Quét & xem trước'}
                </button>
                <button type="button" onClick={resetVocabularyPreview} style={styles.cancelBtn}>
                  Xóa preview
                </button>
              </div>
            </div>

            {vocabularyPreviewRows.length > 0 && (
              <div style={{ marginTop: '18px' }}>
                <h4 style={styles.subTitle}>Xem trước từ vựng</h4>
                {vocabularyParseMeta && (
                  <div style={styles.pipelineInfoBox}>
                    <div>Loại file: <strong>{String(vocabularyParseMeta.fileType || '').toUpperCase()}</strong></div>
                    <div>Nguồn parse: <strong>{vocabularyParseMeta.source === 'table' ? 'Table structure' : 'Raw text fallback'}</strong></div>
                    <div>Bảng nhận diện: <strong>{vocabularyParseMeta.usedTable ? 'Có' : 'Không'}</strong> ({vocabularyParseMeta.totalRows} dòng)</div>
                    <div>AI validation: <strong>{vocabularyParseMeta.aiValidationApplied ? 'Đã áp dụng' : 'Không áp dụng'}</strong></div>
                    {vocabularyParseMeta.aiWarnings?.length > 0 && (
                      <div style={{ marginTop: '6px', color: '#b45309' }}>
                        {vocabularyParseMeta.aiWarnings.join(' | ')}
                      </div>
                    )}
                  </div>
                )}
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeadRow}>
                        <th style={styles.th}>STT</th>
                        <th style={styles.th}>English</th>
                        <th style={styles.th}>Phiên âm</th>
                        <th style={styles.th}>Nghĩa tiếng Việt</th>
                        <th style={styles.th}>Ví dụ</th>
                        <th style={styles.th}>Nghe</th>
                        <th style={styles.th}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vocabularyPreviewRows.map((item, idx) => (
                        <tr key={`${item.word || 'row'}-${idx}`} style={styles.tableRow}>
                          <td style={styles.td}>{idx + 1}</td>
                          <td style={styles.td}>
                            <input style={styles.tableInput} value={item.word || ''} onChange={(e) => updatePreviewRow(idx, 'word', e.target.value)} />
                            {isLikelySuspiciousVocabularyRow(item) && <div style={styles.rowWarning}>Kiểm tra lại cột từ</div>}
                          </td>
                          <td style={styles.td}><input style={styles.tableInput} value={item.pronunciation || ''} onChange={(e) => updatePreviewRow(idx, 'pronunciation', e.target.value)} /></td>
                          <td style={styles.td}><textarea style={styles.tableTextarea} value={item.meaning || ''} onChange={(e) => updatePreviewRow(idx, 'meaning', e.target.value)} /></td>
                          <td style={styles.td}><textarea style={styles.tableTextarea} value={item.example_sentence || ''} onChange={(e) => updatePreviewRow(idx, 'example_sentence', e.target.value)} /></td>
                          <td style={styles.td}>
                            <button type="button" onClick={() => speakWord(item.word)} style={styles.secondaryBtn}>Nghe</button>
                          </td>
                          <td style={styles.td}>
                            <button type="button" onClick={() => removePreviewRow(idx)} style={styles.dangerBtn}>Xóa</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button type="button" style={styles.submitBtn} onClick={importPreviewVocabulary} disabled={vocabularySaveLoading}>
                    {vocabularySaveLoading ? 'Đang lưu...' : 'Lưu toàn bộ vào lesson'}
                  </button>
                </div>

                {vocabularyPreviewRaw && (
                  <details style={{ marginTop: '14px' }}>
                    <summary style={styles.previewSummary}>Xem text đã quét</summary>
                    <pre style={styles.previewRawText}>{vocabularyPreviewRaw}</pre>
                  </details>
                )}
              </div>
            )}

            <div style={{ marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '18px' }}>
              <h4 style={styles.subTitle}>Nhập tay / sửa một từ</h4>
              <form onSubmit={submitVocabulary}>
                <label style={styles.label}>Từ vựng</label>
                <input
                  style={styles.input}
                  value={vocabularyForm.word}
                  onChange={(e) => setVocabularyForm((prev) => ({ ...prev, word: e.target.value }))}
                  required
                />

                <label style={styles.label}>Phiên âm</label>
                <input
                  style={styles.input}
                  value={vocabularyForm.pronunciation}
                  onChange={(e) => setVocabularyForm((prev) => ({ ...prev, pronunciation: e.target.value }))}
                />

                <label style={styles.label}>Nghĩa</label>
                <textarea
                  style={{ ...styles.input, height: '72px', resize: 'vertical' }}
                  value={vocabularyForm.meaning}
                  onChange={(e) => setVocabularyForm((prev) => ({ ...prev, meaning: e.target.value }))}
                  required
                />

                <label style={styles.label}>Ví dụ</label>
                <textarea
                  style={{ ...styles.input, height: '72px', resize: 'vertical' }}
                  value={vocabularyForm.example_sentence}
                  onChange={(e) => setVocabularyForm((prev) => ({ ...prev, example_sentence: e.target.value }))}
                />

                <label style={styles.label}>Dịch ví dụ</label>
                <textarea
                  style={{ ...styles.input, height: '72px', resize: 'vertical' }}
                  value={vocabularyForm.example_translation}
                  onChange={(e) => setVocabularyForm((prev) => ({ ...prev, example_translation: e.target.value }))}
                />

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button type="submit" style={styles.submitBtn}>
                    {editingVocabulary ? 'Cập nhật từ vựng' : 'Tạo từ vựng'}
                  </button>
                  {editingVocabulary && (
                    <button type="button" onClick={resetVocabularyDraft} style={styles.cancelBtn}>
                      Hủy chỉnh sửa
                    </button>
                  )}
                </div>
              </form>
            </div>

            {vocabularyLoading && <p style={styles.statusText}>Đang tải danh sách từ vựng...</p>}
            {!vocabularyLoading && selectedVocabularyLesson && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={styles.subTitle}>Danh sách từ vựng - {lessonLabel(selectedVocabularyLesson)}</h4>
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeadRow}>
                        <th style={styles.th}>STT</th>
                        <th style={styles.th}>Từ</th>
                        <th style={styles.th}>Phiên âm</th>
                        <th style={styles.th}>Nghĩa</th>
                        <th style={styles.th}>Ví dụ</th>
                        <th style={styles.th}>Nghe</th>
                        <th style={styles.th}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vocabularies.map((item, idx) => (
                        <tr key={item.id} style={styles.tableRow}>
                          <td style={styles.td}>{idx + 1}</td>
                          <td style={styles.td}><strong>{item.word}</strong></td>
                          <td style={styles.td}>{item.pronunciation || '—'}</td>
                          <td style={styles.td}>{item.meaning}</td>
                          <td style={styles.td}>{item.example_sentence || '—'}</td>
                          <td style={styles.td}>
                            <button type="button" onClick={() => speakWord(item.word)} style={styles.secondaryBtn}>Nghe</button>
                          </td>
                          <td style={styles.td}>
                            <div style={styles.actionGroup}>
                              <button type="button" onClick={() => handleEditVocabulary(item)} style={styles.secondaryBtn}>Sửa</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {vocabularies.length === 0 && (
                        <tr>
                          <td colSpan={7} style={styles.emptyCell}>Chưa có từ vựng trong lesson này.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'exercise' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Tạo Exercise (AI)</h3>
            <p style={styles.hintText}>Giáo viên chọn khóa học, kỹ năng, trình độ và số câu. Hệ thống sẽ quét file, tách PART và tạo một bài riêng cho mỗi PART đã chọn.</p>
            {generateLoading && (
              <div style={styles.loadingBanner}>
                <span style={styles.loadingDot} />
                AI đang tạo bài, vui lòng chờ...
              </div>
            )}
            <form onSubmit={submitExercise} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
              <div>
                <label style={styles.label}>Khóa học</label>
                <select
                  style={styles.input}
                  value={exerciseForm.course_id}
                  onChange={(e) => handleExerciseCourseChange(e.target.value)}
                  required
                >
                  <option value="">-- Chọn khóa --</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name} ({String(course.level || '').toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Kỹ năng</label>
                <select
                  style={styles.input}
                  value={exerciseForm.skill}
                  onChange={(e) => {
                    const nextSkill = e.target.value;
                    setExerciseForm((p) => ({
                      ...p,
                      skill: nextSkill,
                      count: nextSkill === 'writing' || nextSkill === 'speaking' ? 0 : (p.count || 5)
                    }));
                    if (nextSkill !== 'listening') {
                      setListeningAudioFile(null);
                    }
                  }}
                >
                  {SKILL_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Trình độ</label>
                <select
                  style={styles.input}
                  value={exerciseForm.cefrLevel}
                  onChange={(e) => setExerciseForm((p) => ({ ...p, cefrLevel: e.target.value }))}
                >
                  {CEFR_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Số câu</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  disabled={exerciseForm.skill === 'writing' || exerciseForm.skill === 'speaking'}
                  style={styles.input}
                  value={exerciseForm.count}
                  onChange={(e) => setExerciseForm((p) => ({ ...p, count: e.target.value }))}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={styles.label}>Tên bài</label>
                <input
                  style={styles.input}
                  value={exerciseForm.title}
                  onChange={(e) => setExerciseForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Nhập tên bài do bạn đặt"
                  required
                />
                <div style={styles.helperText}>AI chỉ tạo nội dung bài. Tên bài do người dùng đặt.</div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <button
                  type="submit"
                  style={styles.submitBtn}
                  disabled={generateLoading || (exerciseForm.skill === 'listening' && !listeningAudioFile)}
                >
                  {generateLoading ? 'Đang tạo...' : 'Tạo bằng AI'}
                </button>
              </div>

            {exerciseForm.skill === 'listening' && (
              <div style={{ marginTop: '12px' }}>
                <label style={styles.label}>File nghe (mp3, wav, m4a, webm, ogg)</label>
                <input
                  type="file"
                  accept="audio/*"
                  style={styles.input}
                  onChange={(e) => setListeningAudioFile(e.target.files?.[0] || null)}
                />
                {listeningAudioFile && (
                  <div style={styles.helperText}>Đã chọn: {listeningAudioFile.name}</div>
                )}
                {!listeningAudioFile && <div style={styles.helperText}>Bạn cần tải file audio để AI tạo bài nghe.</div>}
              </div>
            )}

            <div style={{ marginTop: '12px' }}>
              <label style={styles.label}>Tải file đề (PDF/DOCX) để tách PARTs</label>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={styles.input}
                onChange={(e) => handleExerciseFileChange(e.target.files?.[0] || null)}
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={previewExerciseFile} style={styles.submitBtn} disabled={exercisePreviewLoading || !exerciseFile}>
                  {exercisePreviewLoading ? 'Đang quét...' : 'Quét & tách PARTs'}
                </button>
                <button type="button" onClick={() => { setExerciseFile(null); setExerciseParts([]); setExerciseSelectedParts([]); }} style={styles.cancelBtn}>
                  Xóa
                </button>
              </div>

              {exerciseParts.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <h4 style={styles.subTitle}>Chọn Part để dùng</h4>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setExerciseSelectedParts(exerciseParts.map((_part, index) => index))} style={styles.secondaryBtn}>
                      Chọn tất cả ({exerciseParts.length})
                    </button>
                    <button type="button" onClick={() => setExerciseSelectedParts([])} style={styles.secondaryBtn}>
                      Bỏ chọn tất cả
                    </button>
                    <button type="submit" style={styles.submitBtn} disabled={generateLoading || (exerciseForm.skill === 'listening' && !listeningAudioFile)}>
                      {generateLoading ? 'Đang tạo...' : `Tạo ${exerciseSelectedParts.length > 0 ? exerciseSelectedParts.length : exerciseParts.length} bài theo PART`}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    {exerciseParts.map((p, idx) => (
                      <div
                        key={`part-${idx}`}
                        onClick={() => setExerciseSelectedParts((prev) => (prev.includes(idx) ? prev.filter((item) => item !== idx) : [...prev, idx]))}
                        style={{
                          padding: '12px', borderRadius: '10px', border: exerciseSelectedParts.includes(idx) ? '2px solid #1f7a8c' : '1px solid #e2e8f0',
                          background: exerciseSelectedParts.includes(idx) ? '#f0fdfa' : '#fff', cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: '700', color: '#1f2937', flex: 1 }}>{p.title || `Part ${idx + 1}`}</div>
                          <input type="checkbox" readOnly checked={exerciseSelectedParts.includes(idx)} />
                        </div>
                        <div style={{ maxHeight: '120px', overflow: 'hidden', color: '#334155', whiteSpace: 'pre-wrap', marginBottom: '8px' }}>{p.content}</div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPartForDetail(idx);
                          }}
                          style={{
                            border: '1px solid #cbd5e1',
                            background: '#f0f9ff',
                            color: '#0369a1',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '12px',
                            transition: 'all 0.2s'
                          }}
                        >
                          Xem chi tiết
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            </form>

            {/* Modal - Xem chi tiết PART */}
            {selectedPartForDetail !== null && exerciseParts[selectedPartForDetail] && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                  padding: '20px'
                }}
                onClick={() => setSelectedPartForDetail(null)}
              >
                <div
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '24px',
                    maxWidth: '600px',
                    width: '100%',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, color: '#1f2937' }}>Chi tiết PART</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedPartForDetail(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '24px',
                        cursor: 'pointer',
                        color: '#667085',
                        padding: '0',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <strong style={{ color: '#1f2937', fontSize: '14px' }}>{exerciseParts[selectedPartForDetail].title}</strong>
                  </div>
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '16px',
                      whiteSpace: 'pre-wrap',
                      color: '#334155',
                      lineHeight: '1.6',
                      fontSize: '13px'
                    }}
                  >
                    {exerciseParts[selectedPartForDetail].content}
                  </div>
                  <div style={{ marginTop: '16px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedPartForDetail(null)}
                      style={{
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#334155',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px'
                      }}
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>
            )}

            {createdExerciseInfos.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={styles.subTitle}>Danh sách bài đã tạo</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {createdExerciseInfos.map((item) => (
                    <div key={item.exerciseId || item.exerciseTitle} style={styles.exerciseCard}>
                      <div style={styles.exerciseQuestion}>Đã tạo: {item.exerciseTitle}</div>
                      <div style={styles.answer}>Số câu: {item.questionCount}</div>
                      {item.exerciseSet?.taskPrompt && (
                        <div style={styles.previewBlock}>
                          <strong>Đề bài:</strong>
                          <div style={styles.previewText}>{item.exerciseSet.taskPrompt}</div>
                        </div>
                      )}
                      {item.exerciseSet?.readingPassage && (
                        <div style={styles.previewBlock}>
                          <strong>Bài đọc:</strong>
                          <div style={styles.previewText}>{item.exerciseSet.readingPassage}</div>
                        </div>
                      )}
                      {item.audioUrl && (
                        <div style={styles.previewBlock}>
                          <strong>Audio:</strong>
                          <audio controls style={{ width: '100%', marginTop: '8px' }} src={item.audioUrl} />
                        </div>
                      )}
                      {Array.isArray(item.exerciseSet?.questions) && item.exerciseSet.questions.length > 0 && (
                        <div style={styles.previewBlock}>
                          <strong>Danh sách câu hỏi:</strong>
                          {item.exerciseSet.questions.map((q, idx) => (
                            <div key={idx} style={styles.questionPreviewCard}>
                              <div style={styles.exerciseQuestion}>{idx + 1}. {q.question}</div>
                              <div style={styles.optionPreviewGrid}>
                                {(q.options || []).map((opt, i) => (
                                  <div key={i} style={styles.optionPreviewItem}>{String.fromCharCode(65 + i)}. {opt}</div>
                                ))}
                              </div>
                              <div style={styles.answer}>Đáp án: {q.correctAnswer}</div>
                              {q.explanation && <div style={styles.explainText}>Gợi ý: {q.explanation}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                      {item.exerciseSet?.sampleAnswer && (
                        <div style={styles.previewBlock}>
                          <strong>Bài mẫu:</strong>
                          <div style={styles.previewText}>{item.exerciseSet.sampleAnswer}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {createdExerciseInfos.length === 1 && (
                  <div style={{ marginTop: '14px' }}>
                    <label style={styles.label}>Khung chat chỉnh sửa với AI</label>
                    <textarea
                      style={{ ...styles.input, height: '90px', resize: 'vertical' }}
                      placeholder="Ví dụ: Hãy làm câu 2 dễ hơn, thêm 1 câu hỏi, đổi từ vựng sang chủ đề technology..."
                      value={editFeedback}
                      onChange={(e) => setEditFeedback(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                      <button type="button" onClick={refineExercise} style={styles.submitBtn} disabled={refineLoading || generateLoading}>
                        {refineLoading ? 'Đang chỉnh sửa...' : generateLoading ? 'Đang tạo bài...' : 'Chỉnh sửa bằng AI'}
                      </button>
                      <button type="button" onClick={resetExerciseDraft} style={styles.cancelBtn}>
                        Tạo bài mới
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '10px' }}>
                  <button type="button" style={styles.secondaryPreviewBtn} onClick={() => navigate(`/courses/${exerciseForm.course_id}/skills/${exerciseForm.skill}/exercises`)}>
                    Xem danh sách bài
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrapper: { fontFamily: 'sans-serif', minHeight: '100vh', background: '#f5f6fa' },
  header: {
    background: 'linear-gradient(135deg, #1f7a8c 0%, #2c5f8a 100%)',
    padding: '16px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#fff'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  backBtn: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.4)',
    padding: '7px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  logo: { fontSize: '20px', fontWeight: 'bold' },
  welcomeText: { fontSize: '14px' },
  content: { maxWidth: '1100px', margin: '0 auto', padding: '28px 24px' },
  modeBar: { display: 'flex', gap: '10px', marginBottom: '16px' },
  modeBtn: {
    background: '#edf2f7',
    color: '#4a5568',
    border: '1px solid #cbd5e0',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  modeBtnActive: {
    background: 'linear-gradient(135deg, #1f7a8c 0%, #2c5f8a 100%)',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
  },
  cardTitle: { marginTop: 0, marginBottom: '14px', color: '#234' },
  hintText: { marginTop: 0, marginBottom: '14px', color: '#4a5568', fontSize: '14px' },
  loadingBanner: {
    marginBottom: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #bfdbfe',
    background: '#eff6ff',
    color: '#1e3a8a',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: '600'
  },
  loadingDot: {
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    background: '#2563eb'
  },
  label: { display: 'block', marginBottom: '6px', color: '#555', fontSize: '13px', fontWeight: '600' },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    marginBottom: '12px',
    boxSizing: 'border-box',
    fontSize: '14px'
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #1f7a8c 0%, #2c5f8a 100%)',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  successBanner: {
    background: '#f0fff4',
    color: '#276749',
    border: '1px solid #c6f6d5',
    padding: '10px 16px',
    borderRadius: '8px',
    marginBottom: '16px'
  },
  errorBanner: {
    background: '#fff5f5',
    color: '#c53030',
    border: '1px solid #fed7d7',
    padding: '10px 16px',
    borderRadius: '8px',
    marginBottom: '16px'
  },
  exerciseCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '10px',
    background: '#fafcff'
  },
  exerciseQuestion: { fontWeight: '600', color: '#2d3748' },
  options: { margin: '8px 0', paddingLeft: '20px', color: '#4a5568' },
  answer: { color: '#1f7a8c', fontWeight: '600' },
  previewBlock: {
    marginTop: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #dbeafe',
    background: '#f8fbff'
  },
  previewText: { whiteSpace: 'pre-wrap', color: '#334155', marginTop: '6px', lineHeight: 1.5 },
  questionPreviewCard: {
    marginTop: '10px',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: '#fff'
  },
  optionPreviewGrid: { display: 'grid', gap: '6px', marginTop: '8px' },
  optionPreviewItem: { padding: '8px 10px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' },
  explainText: { marginTop: '8px', color: '#0f766e', fontStyle: 'italic' },
  helperText: { color: '#b45309', marginTop: '8px', fontSize: '13px' },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#334155',
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '12px'
  },
  uploadBox: {
    marginTop: '12px',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #dbeafe',
    background: '#f8fbff'
  },
  subTitle: { margin: '0 0 10px 0', color: '#234', fontSize: '16px' },
  pipelineInfoBox: {
    marginBottom: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #bfdbfe',
    background: '#eff6ff',
    color: '#1e3a8a',
    fontSize: '13px',
    lineHeight: 1.6
  },
  tableWrapper: {
    overflowX: 'auto',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    background: '#fff'
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHeadRow: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff' },
  th: { textAlign: 'left', padding: '12px 14px', fontSize: '14px', whiteSpace: 'nowrap' },
  td: { padding: '12px 14px', borderTop: '1px solid #edf2f7', verticalAlign: 'top', fontSize: '14px', color: '#334155' },
  tableRow: { background: '#fff' },
  tableInput: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px'
  },
  tableTextarea: {
    width: '100%',
    minHeight: '68px',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px',
    resize: 'vertical'
  },
  emptyCell: { padding: '18px', textAlign: 'center', color: '#667085' },
  actionGroup: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  secondaryBtn: {
    border: '1px solid #1f7a8c',
    background: '#f8fbff',
    color: '#1f7a8c',
    padding: '8px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px'
  },
  dangerBtn: {
    border: '1px solid #fca5a5',
    background: '#fff5f5',
    color: '#b91c1c',
    padding: '8px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px'
  },
  rowWarning: { marginTop: '6px', color: '#b45309', fontSize: '12px', fontWeight: '600' },
  previewSummary: { cursor: 'pointer', fontWeight: '600', color: '#1f7a8c' },
  previewRawText: {
    whiteSpace: 'pre-wrap',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '8px',
    color: '#334155',
    overflowX: 'auto'
  },
  secondaryPreviewBtn: {
    border: '1px solid #1f7a8c',
    background: '#f8fbff',
    color: '#1f7a8c',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  cancelBtn: {
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#334155',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  }
};

export default TeacherCreateContent;
