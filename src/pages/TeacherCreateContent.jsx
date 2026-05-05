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
  language_id: '',
  title: '',
  content: '',
  lesson_order: 1
};

const defaultExercise = {
  course_id: '',
  lesson_id: '',
  title: '',
  skill: 'reading',
  cefrLevel: 'A2'
};

const defaultVocabulary = {
  language_id: '',
  lesson_id: '',
  lesson_title: '',
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
  const [mode, setMode] = useState('vocabulary');

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

  const fetchLessonsForLanguage = (languageId, setLessons, setLoading) => {
    if (!languageId) {
      setLessons([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.get(`/lessons?languageId=${languageId}`)
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

  // Helper: Parse questions from raw text (same logic as backend)
  const parseQuestionsFromText = (text) => {
    if (!text) return [];
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const questions = [];
    let i = 0;
    while (i < lines.length) {
      const qMatch = lines[i].match(/^\s*(\d+)\s*[\.)]\s*(.+)$/);
      if (qMatch) {
        const qTextParts = [qMatch[2] || ''];
        const options = [];
        let correctAnswer = null;
        i += 1;
        let optionLetter = 'A';
        while (i < lines.length) {
          const optMatch = lines[i].match(/^\s*(\(?\s*([A-Da-d])\s*\)?\.?\)?)\s*(.+)$/);
          if (optMatch) {
            const optText = String(optMatch[3] || '').trim();
            const fullLine = lines[i].trim();
            const isMarkedCorrect = /^\(\s*[A-Da-d]\s*\.?\s*\)/.test(fullLine);
            if (isMarkedCorrect) {
              correctAnswer = optText;
            }
            options.push(optText);
            optionLetter = String.fromCharCode(optionLetter.charCodeAt(0) + 1);
            i += 1;
            continue;
          }
          const nextQMatch = lines[i].match(/^\s*\d+\s*[\.)]\s*/);
          if (nextQMatch) break;
          if (options.length === 0) {
            qTextParts.push(lines[i]);
            i += 1;
            continue;
          }
          break;
        }
        questions.push({ question: qTextParts.join(' ').trim(), options, correctAnswer });
        continue;
      }
      i += 1;
    }
    return questions;
  };

  const syncExerciseLesson = (courseId, lessonId = '') => {
    const courseLessons = exerciseLessons.length > 0 ? exerciseLessons : [];
    const lesson = courseLessons.find((item) => String(item.id) === String(lessonId));
    setExerciseForm((prev) => ({
      ...prev,
      course_id: courseId,
      lesson_id: lessonId,
      title: lesson ? lessonLabel(lesson) : ''
    }));
  };

  const syncVocabularyLesson = (courseId, lessonId = '') => {
    setVocabularyForm((prev) => ({
      ...prev,
      language_id: courseId,
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
        showMsg('error', 'AI tạo bài đã bị tắt. Vui lòng chọn PART hoặc tải lên file chứa PART để tạo bài.');
        setGenerateLoading(false);
        return;
      } else {
        // Create exercises directly from selected PARTs (no AI generation)
        const partsPayload = selectedParts.map((p) => ({ title: p.part.title || '', content: p.part.content || '' }));
        const formData = new FormData();
        formData.append('course_id', String(Number(exerciseForm.course_id)));
        formData.append('exerciseTitle', manualTitle);
        formData.append('skill', exerciseForm.skill);
        formData.append('cefrLevel', exerciseForm.cefrLevel);
        formData.append('parts', JSON.stringify(partsPayload));

        if (exerciseForm.skill === 'listening') {
          if (!listeningAudioFile) {
            showMsg('error', 'Vui lòng tải file audio cho bài nghe.');
            return;
          }
          formData.append('audioFile', listeningAudioFile);
        }

        const res = await api.post('/exercises/create-from-parts', formData, {
          timeout: 60000
        });

        if (res.data?.created) {
          for (const c of res.data.created) {
            createdItems.push({
              exerciseId: c.exerciseId,
              exerciseTitle: c.exerciseTitle,
              audioUrl: null,
              exerciseSet: {
                readingPassage: c.readingPassage,
                taskPrompt: c.taskPrompt,
                questions: Array.isArray(c.questions) ? c.questions : []
              },
              skill: exerciseForm.skill,
              
            });
          }
        }
      }

      setCreatedExerciseInfos(createdItems);
      setListeningAudioFile(null);
      showMsg('success', `Đã tạo và lưu ${createdItems.length} bài tập vào kho bài tập.`);
    } catch (err) {
      const detail = err?.response?.data?.message || err?.message || 'Tạo exercise thất bại';
      console.error('[TeacherCreateContent] Exercise generation failed', {
        request: {
          course_id: Number(exerciseForm.course_id),
          skill: exerciseForm.skill,
          cefrLevel: exerciseForm.cefrLevel,
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

  // AI refine functionality removed.

  const resetExerciseDraft = () => {
    setCreatedExerciseInfos([]);
    // reset
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
      cefrLevel: CEFR_LEVELS.includes(level) ? level : prev.cefrLevel
    }));
  };

  const handleVocabularyLanguageChange = (languageId) => {
    setVocabularyForm((prev) => ({
      ...prev,
      language_id: languageId,
      lesson_id: '',
      lesson_title: '',
      word: '',
      pronunciation: '',
      meaning: '',
      example_sentence: '',
      example_translation: ''
    }));
    setVocabularyLessons([]);
    setVocabularies([]);
    resetVocabularyPreview();
    fetchLessonsForLanguage(languageId, setVocabularyLessons, setVocabularyLessonLoading);
  };

  const handleVocabularyLessonChange = (lessonId) => {
    setVocabularyForm((prev) => ({
      ...prev,
      lesson_id: lessonId
    }));
    resetVocabularyPreview();
    fetchVocabulary(lessonId);
  };

  const handleVocabularySelectExistingLesson = (lessonId) => {
    setVocabularyForm((prev) => ({ ...prev, lesson_id: lessonId, lesson_title: '' }));
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
      formData.append('skill', exerciseForm.skill);
      const res = await api.post('/exercises/preview-parts', formData, { timeout: 90000 });
      const parts = Array.isArray(res.data?.parts) ? res.data.parts : [];
      setExerciseParts(parts);
      setExerciseSelectedParts(parts.map((_part, index) => index));
      if (parts.length === 0) {
        showMsg('info', 'Không tìm thấy phần nội dung phù hợp trong tài liệu.');
      } else {
        showMsg('success', `Tìm thấy ${parts.length} phần nội dung. Chọn phần để sử dụng cho bài tập.`);
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
    // ensure lesson exists: if teacher provided a title, create the lesson first
    let lessonId = vocabularyForm.lesson_id;
    try {
      if (!lessonId) {
        const title = String(vocabularyForm.lesson_title || '').trim();
        if (!title) {
          setVocabularyPreviewMsg({ type: 'error', text: 'Vui lòng chọn hoặc nhập tên lesson trước khi lưu.' });
          return;
        }
        const languageId = vocabularyForm.language_id || (languages[0] && languages[0].id);
        const lessonRes = await api.post('/lessons/teacher-create', { language_id: languageId, title });
        lessonId = lessonRes.data?.id;
        // refresh lesson list
        fetchLessonsForLanguage(languageId, setVocabularyLessons, setVocabularyLessonLoading);
        setVocabularyForm((prev) => ({ ...prev, lesson_id: lessonId }));
      }
    } catch (err) {
      setVocabularyPreviewMsg({ type: 'error', text: err.response?.data?.message || 'Không thể tạo lesson tự động' });
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
        lesson_id: Number(lessonId),
        items: normalizedItems
      });

      setVocabularyMsg({ type: 'success', text: `Đã lưu ${normalizedItems.length} từ vựng từ file.` });
      setVocabularyPreviewMsg({ type: 'success', text: 'Lưu thành công. Bảng preview đã được làm mới.' });
      resetVocabularyPreview();
      fetchVocabulary(lessonId);
    } catch (err) {
      setVocabularyPreviewMsg({ type: 'error', text: err.response?.data?.message || 'Lưu từ vựng từ file thất bại' });
    } finally {
      setVocabularySaveLoading(false);
    }
  };

  const handleEditVocabulary = (item) => {
    setEditingVocabulary(item.id);
    const nextLanguageId = item.lesson?.language_id ? String(item.lesson.language_id) : '';
    const nextLessonId = item.lesson_id ? String(item.lesson_id) : '';
    const nextLessonTitle = item.lesson?.title || '';
    setVocabularyForm({
      language_id: nextLanguageId,
      lesson_id: nextLessonId,
      lesson_title: nextLessonTitle,
      word: item.word || '',
      pronunciation: item.pronunciation || '',
      meaning: item.meaning || '',
      example_sentence: item.example_sentence || '',
      example_translation: item.example_translation || ''
    });
    setMode('vocabulary');
    if (nextLanguageId) {
      fetchLessonsForLanguage(nextLanguageId, setVocabularyLessons, setVocabularyLessonLoading);
    }
    if (nextLessonId) {
      fetchVocabulary(nextLessonId);
    }
  };

  const resetVocabularyDraft = () => {
    setEditingVocabulary(null);
    setVocabularyForm((prev) => ({
      ...defaultVocabulary,
      language_id: prev.language_id,
      lesson_id: prev.lesson_id,
      lesson_title: prev.lesson_title
    }));
  };

  const submitVocabulary = async (e) => {
    e.preventDefault();
    setVocabularyMsg(null);

    if (!vocabularyForm.lesson_id && !String(vocabularyForm.lesson_title || '').trim()) {
      setVocabularyMsg({ type: 'error', text: 'Vui lòng chọn lesson hoặc nhập tên lesson trước khi lưu từ.' });
      return;
    }
    if (!vocabularyForm.word.trim() || !vocabularyForm.meaning.trim()) {
      setVocabularyMsg({ type: 'error', text: 'Vui lòng nhập từ và nghĩa.' });
      return;
    }

    // if lesson id missing but title present, create lesson
    let lessonId = vocabularyForm.lesson_id;
    if (!lessonId) {
      try {
        const languageId = vocabularyForm.language_id || (languages[0] && languages[0].id);
        const title = String(vocabularyForm.lesson_title || '').trim();
        const lessonRes = await api.post('/lessons/teacher-create', { language_id: languageId, title });
        lessonId = lessonRes.data?.id;
        fetchLessonsForLanguage(languageId, setVocabularyLessons, setVocabularyLessonLoading);
        setVocabularyForm((prev) => ({ ...prev, lesson_id: lessonId }));
      } catch (err) {
        setVocabularyMsg({ type: 'error', text: err.response?.data?.message || 'Không thể tạo lesson tự động' });
        return;
      }
    }

    try {
      const payload = {
        lesson_id: Number(lessonId),
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
          <div>
            <div style={styles.logo}>Teacher Workspace</div>
          </div>
        </div>
        <span style={styles.welcomeText}>Giáo viên: <strong>{currentUser.username}</strong></span>
      </div>

      <div style={styles.content}>
        <div style={styles.hero}>
          <div style={styles.heroStats}>
            <div style={styles.statCard}>
              <span style={styles.statLabel}>Vocabulary rows</span>
              <strong style={styles.statValue}>{vocabularyPreviewRows.length || vocabularies.length}</strong>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statLabel}>Exercise parts</span>
              <strong style={styles.statValue}>{exerciseParts.length}</strong>
            </div>
          </div>
        </div>

        <div style={styles.mainPanel}>
            <div style={styles.panelHeader}>
              <div>
                <div style={styles.panelEyebrow}>Content tools</div>
                <h2 style={styles.panelTitle}>{mode === 'vocabulary' ? 'Vocabulary editor' : 'Exercise builder'}</h2>
              </div>
              <div style={styles.panelMeta}>
                <span style={mode === 'vocabulary' ? styles.panelPillActive : styles.panelPill}>Vocabulary</span>
                <span style={mode === 'exercise' ? styles.panelPillActive : styles.panelPill}>Exercise</span>
              </div>
            </div>

        {message && <div style={message.type === 'success' ? styles.successBanner : styles.errorBanner}>{message.text}</div>}

        <div style={styles.modeBar}>
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

        {false && mode === 'course' && (
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

              <label style={styles.label}>Duration (hours)</label>
              <input type="number" style={styles.input} value={courseForm.duration} onChange={(e) => setCourseForm((p) => ({ ...p, duration: e.target.value }))} />

              <label style={styles.label}>Mô tả</label>
              <textarea style={{ ...styles.input, height: '80px', resize: 'vertical' }} value={courseForm.description} onChange={(e) => setCourseForm((p) => ({ ...p, description: e.target.value }))} />

              <button type="submit" style={styles.submitBtn}>Tạo Course</button>
            </form>
          </div>
        )}

        {false && mode === 'lesson' && (
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
                  <label style={styles.label}>Ngôn ngữ</label>
                  <select
                    style={styles.input}
                    value={vocabularyForm.language_id}
                    onChange={(e) => handleVocabularyLanguageChange(e.target.value)}
                  >
                    <option value="">-- Chọn ngôn ngữ --</option>
                    {languages.map((lang) => (
                      <option key={lang.id} value={lang.id}>{lang.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Chọn lesson có sẵn (tùy chọn)</label>
                  <select
                    style={styles.input}
                    value={vocabularyForm.lesson_id}
                    onChange={(e) => handleVocabularySelectExistingLesson(e.target.value)}
                    disabled={!vocabularyForm.language_id || vocabularyLessonLoading}
                  >
                    <option value="">-- Chọn lesson --</option>
                    {vocabularyLessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>{lessonLabel(lesson)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label style={{ ...styles.label, marginTop: '12px' }}>Hoặc nhập tên chủ đề (ví dụ: Healthy)</label>
              <input
                style={styles.input}
                value={vocabularyForm.lesson_title}
                onChange={(e) => setVocabularyForm((prev) => ({ ...prev, lesson_title: e.target.value, lesson_id: '' }))}
                placeholder="Nhập tên chủ đề mới hoặc để trống nếu chọn lesson có sẵn"
              />

              <label style={styles.label}>File từ vựng (PDF, DOCX, TXT)</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                style={styles.input}
                onChange={(e) => handleVocabularyFileChange(e.target.files?.[0] || null)}
              />
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
            <p style={styles.hintText}>Giáo viên chọn kỹ năng. Hệ thống sẽ quét file, tách phần nội dung và tạo một bài riêng cho mỗi phần đã chọn.</p>
            {generateLoading && (
              <div style={styles.loadingBanner}>
                <span style={styles.loadingDot} />
                Đang tạo bài, vui lòng chờ...
              </div>
            )}
            <form onSubmit={submitExercise} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
              <div>
                <label style={styles.label}>Kỹ năng</label>
                <select
                  style={styles.input}
                  value={exerciseForm.skill}
                  onChange={(e) => {
                    const nextSkill = e.target.value;
                    setExerciseForm((p) => ({
                      ...p,
                      skill: nextSkill
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

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={styles.label}>Tên bài</label>
                <input
                  style={styles.input}
                  value={exerciseForm.title}
                  onChange={(e) => setExerciseForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Nhập tên bài do bạn đặt"
                  required
                />
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
              <label style={styles.label}>Tải file đề (PDF/DOCX) để quét nội dung</label>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={styles.input}
                onChange={(e) => handleExerciseFileChange(e.target.files?.[0] || null)}
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={previewExerciseFile} style={styles.submitBtn} disabled={exercisePreviewLoading || !exerciseFile}>
                  {exercisePreviewLoading ? 'Đang quét...' : 'Quét nội dung'}
                </button>
                <button type="button" onClick={() => { setExerciseFile(null); setExerciseParts([]); setExerciseSelectedParts([]); }} style={styles.cancelBtn}>
                  Xóa
                </button>
              </div>

              {exerciseParts.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <h4 style={styles.subTitle}>Chọn phần nội dung để dùng</h4>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setExerciseSelectedParts(exerciseParts.map((_part, index) => index))} style={styles.secondaryBtn}>
                      Chọn tất cả ({exerciseParts.length})
                    </button>
                    <button type="button" onClick={() => setExerciseSelectedParts([])} style={styles.secondaryBtn}>
                      Bỏ chọn tất cả
                    </button>
                    <button type="submit" style={styles.submitBtn} disabled={generateLoading || (exerciseForm.skill === 'listening' && !listeningAudioFile)}>
                      {generateLoading ? 'Đang tạo...' : `Tạo ${exerciseSelectedParts.length > 0 ? exerciseSelectedParts.length : exerciseParts.length} bài`}
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
                    maxWidth: '700px',
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

                  {/* Display parsed questions with correct answers highlighted */}
                  {(() => {
                    const partContent = exerciseParts[selectedPartForDetail].content || '';
                    const parsedQuestions = parseQuestionsFromText(partContent);
                    if (parsedQuestions.length > 0) {
                      return (
                        <div style={{ marginBottom: '16px' }}>
                          <strong style={{ color: '#1f2937', fontSize: '13px', display: 'block', marginBottom: '8px' }}>📋 Câu hỏi đã phân tích:</strong>
                          {parsedQuestions.map((q, idx) => (
                            <div key={idx} style={{ marginBottom: '12px', padding: '12px', background: '#f1f5f9', borderRadius: '6px', borderLeft: '3px solid #3b82f6' }}>
                              <strong style={{ color: '#1f2937', fontSize: '13px' }}>{idx + 1}. {q.question}</strong>
                              <div style={{ marginTop: '8px', marginLeft: '8px' }}>
                                {q.options.map((opt, optIdx) => {
                                  const isCorrect = opt === q.correctAnswer;
                                  return (
                                    <div key={optIdx} style={{
                                      padding: '6px 8px',
                                      margin: '4px 0',
                                      background: isCorrect ? '#dcfce7' : '#f9fafb',
                                      borderLeft: isCorrect ? '2px solid #22c55e' : '2px solid #e5e7eb',
                                      color: isCorrect ? '#166534' : '#374151',
                                      fontSize: '13px'
                                    }}>
                                      {String.fromCharCode(65 + optIdx)}. {opt}
                                      {isCorrect && <span style={{ marginLeft: '6px', fontWeight: '700' }}>✓ Đáp án đúng</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <details style={{ marginTop: '12px' }}>
                    <summary style={{ cursor: 'pointer', color: '#667085', fontSize: '13px', fontWeight: '600', userSelect: 'none' }}>Xem text gốc</summary>
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '16px',
                        whiteSpace: 'pre-wrap',
                        color: '#334155',
                        lineHeight: '1.6',
                        fontSize: '13px',
                        marginTop: '8px'
                      }}
                    >
                      {exerciseParts[selectedPartForDetail].content}
                    </div>
                  </details>

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
                      {item.exerciseSet?.taskPrompt && (
                        <div style={styles.previewBlock}>
                          <strong>Đề bài:</strong>
                          <div style={styles.previewText}>{item.exerciseSet.taskPrompt}</div>
                        </div>
                      )}
                      {item.exerciseSet?.readingPassage && (
                        <div style={styles.previewBlock}>
                          <strong>Bài đọc / Đề bài:</strong>
                          <div style={styles.previewText}>{item.exerciseSet.readingPassage}</div>
                        </div>
                      )}
                      {Array.isArray(item.exerciseSet?.questions) && item.exerciseSet.questions.length > 0 && (
                        <div style={styles.previewBlock}>
                          <strong>Danh sách câu hỏi:</strong>
                          <ol style={{ paddingLeft: '20px', marginTop: '8px' }}>
                            {item.exerciseSet.questions.map((q, qIdx) => (
                              <li key={qIdx} style={{ marginBottom: '10px' }}>
                                <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>{q.question}</div>
                                <ul style={{ listStyle: 'upper-alpha', paddingLeft: '18px', margin: 0 }}>
                                  {Array.isArray(q.options) && q.options.map((opt, oIdx) => (
                                    <li key={oIdx} style={{ fontWeight: 400, color: '#334155', marginBottom: '2px' }}>{opt}</li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ol>
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

                {/* AI refine removed */}

              </div>
            )}
          </div>
        )}
        </div>
    </div>
  </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at top left, rgba(31, 122, 140, 0.14), transparent 28%), linear-gradient(180deg, #eef4fb 0%, #f7f9fc 38%, #edf2f8 100%)',
    color: '#0f172a',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
  },
  header: {
    background: 'rgba(8, 47, 73, 0.92)',
    backdropFilter: 'blur(14px)',
    borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
    padding: '16px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#fff',
    position: 'sticky',
    top: 0,
    zIndex: 20
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  backBtn: {
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    padding: '9px 16px',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  logo: { fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '12px', color: 'rgba(226, 232, 240, 0.82)', marginTop: '2px' },
  welcomeText: { fontSize: '14px', color: 'rgba(226, 232, 240, 0.9)' },
  content: { maxWidth: '1360px', margin: '0 auto', padding: '28px 24px 40px' },
  hero: {
    display: 'flex',
    justifyContent: 'flex-start',
    marginBottom: '18px'
  },
  heroCopy: {
    background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.14), rgba(37, 99, 235, 0.12))',
    border: '1px solid rgba(148, 163, 184, 0.28)',
    borderRadius: '24px',
    padding: '24px 26px',
    boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)'
  },
  heroEyebrow: { textTransform: 'uppercase', letterSpacing: '0.24em', color: '#2563eb', fontSize: '12px', fontWeight: '700' },
  heroTitle: { margin: '10px 0 10px', fontSize: '30px', lineHeight: 1.15, letterSpacing: '-0.03em', color: '#0f172a' },
  heroText: { margin: 0, color: '#475569', fontSize: '14px', lineHeight: 1.65, maxWidth: '760px' },
  heroStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 240px))',
    gap: '12px',
    width: 'fit-content'
  },
  statCard: {
    background: 'rgba(255,255,255,0.9)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: '18px',
    padding: '18px 16px',
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '112px'
  },
  statLabel: { fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.12em' },
  statValue: { fontSize: '28px', color: '#0f172a', marginTop: '10px', letterSpacing: '-0.03em' },
  mainPanel: {
    background: 'rgba(255,255,255,0.82)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '28px',
    padding: '20px',
    boxShadow: '0 22px 44px rgba(15, 23, 42, 0.08)',
    backdropFilter: 'blur(10px)'
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'start', marginBottom: '18px', flexWrap: 'wrap' },
  panelEyebrow: { textTransform: 'uppercase', letterSpacing: '0.18em', color: '#64748b', fontSize: '11px', fontWeight: '800' },
  panelTitle: { margin: '6px 0 0', fontSize: '22px', color: '#0f172a', letterSpacing: '-0.02em' },
  panelMeta: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  panelPill: {
    padding: '8px 12px',
    borderRadius: '999px',
    border: '1px solid #dbe3ee',
    background: '#f8fafc',
    color: '#475569',
    fontSize: '13px',
    fontWeight: '700'
  },
  panelPillActive: {
    padding: '8px 12px',
    borderRadius: '999px',
    border: '1px solid rgba(37, 99, 235, 0.18)',
    background: 'linear-gradient(135deg, #dbeafe, #eff6ff)',
    color: '#1d4ed8',
    fontSize: '13px',
    fontWeight: '800'
  },
  modeBar: {
    display: 'flex',
    gap: '10px',
    marginBottom: '16px',
    padding: '8px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    width: 'fit-content'
  },
  modeBtn: {
    background: 'transparent',
    color: '#4a5568',
    border: '1px solid transparent',
    padding: '10px 16px',
    borderRadius: '999px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  modeBtnActive: {
    background: 'linear-gradient(135deg, #1f7a8c 0%, #2c5f8a 100%)',
    color: '#fff',
    border: '1px solid rgba(37, 99, 235, 0.12)',
    padding: '10px 16px',
    borderRadius: '999px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px'
  },
  card: {
    background: '#fff',
    borderRadius: '22px',
    padding: '22px',
    boxShadow: '0 14px 36px rgba(15,23,42,0.06)',
    border: '1px solid #e6edf5'
  },
  cardTitle: { marginTop: 0, marginBottom: '14px', color: '#0f172a', fontSize: '20px', letterSpacing: '-0.02em' },
  hintText: { marginTop: 0, marginBottom: '14px', color: '#52606d', fontSize: '14px', lineHeight: 1.6 },
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
  label: { display: 'block', marginBottom: '6px', color: '#334155', fontSize: '13px', fontWeight: '700' },
  input: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: '12px',
    border: '1px solid #d6dee9',
    marginBottom: '12px',
    boxSizing: 'border-box',
    fontSize: '14px',
    background: '#fff',
    color: '#0f172a'
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #1f7a8c 0%, #2c5f8a 100%)',
    color: '#fff',
    border: 'none',
    padding: '11px 16px',
    borderRadius: '12px',
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
  subTitle: { margin: '0 0 10px 0', color: '#0f172a', fontSize: '16px', letterSpacing: '-0.01em' },
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
    borderRadius: '16px',
    background: '#fff'
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHeadRow: { background: 'linear-gradient(135deg, #1f7a8c 0%, #2c5f8a 100%)', color: '#fff' },
  th: { textAlign: 'left', padding: '12px 14px', fontSize: '14px', whiteSpace: 'nowrap' },
  td: { padding: '12px 14px', borderTop: '1px solid #edf2f7', verticalAlign: 'top', fontSize: '14px', color: '#334155' },
  tableRow: { background: '#fff' },
  tableInput: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    padding: '8px 10px',
    fontSize: '13px'
  },
  tableTextarea: {
    width: '100%',
    minHeight: '68px',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
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
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px'
  },
  dangerBtn: {
    border: '1px solid #fca5a5',
    background: '#fff5f5',
    color: '#b91c1c',
    padding: '8px 12px',
    borderRadius: '12px',
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
    borderRadius: '12px',
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
