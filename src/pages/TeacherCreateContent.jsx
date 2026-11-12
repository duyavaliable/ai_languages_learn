import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import DocxExamReview from '../components/admin/DocxExamReview';
import ScanExamReview, { audioPlan } from '../components/admin/ScanExamReview';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SKILL_OPTIONS = [
  { value: 'reading', label: 'Đọc' },
  { value: 'listening', label: 'Nghe' },
  { value: 'writing', label: 'Viết' },
  { value: 'speaking', label: 'Nói' }
];
const JAPANESE_SKILL_OPTIONS = [
  { value: 'vocabulary', label: 'Từ vựng' },
  { value: 'grammar', label: 'Ngữ pháp' },
  { value: 'reading', label: 'Đọc' },
  { value: 'listening', label: 'Nghe' },
  { value: 'speaking', label: 'Nói (luyện hội thoại)' }
];
const JAPANESE_PART_OPTIONS = ['N5', 'N4', 'N3', 'N2', 'N1'];

/**
 * Kỹ năng NÓI đi đường khác hẳn các kỹ năng còn lại — đọc trước khi sửa.
 *
 * Nghe / Đọc / Viết / Ngữ pháp / Từ vựng: tải file đề PDF-DOCX, hệ thống quét
 * rồi tách thành câu hỏi. **Giữ nguyên, không đụng vào.**
 *
 * Nói: model chấm phát âm so bản ghi với một VĂN BẢN ĐÍCH biết trước, nên
 * không có "đề" để quét — chỉ có câu người học phải đọc. Giáo viên nhập thẳng
 * từng dòng, lưu vào bảng `speaking_passages`. Mỗi dòng là MỘT lần đọc, chấm
 * riêng từng dòng.
 */
const SPEAKING_SKILL = 'speaking';

const defaultSpeakingPassage = {
  kind: 'passage',
  title: '',
  topic: '',
  level: '',
  content: '',
  source: '',
  license: ''
};

const defaultCourse = {
  language_id: '',
  name: '',
  description: '',
  level: 'A2',
  duration: ''
};

const defaultExercise = {
  course_id: '',
  title: '',
  skill: 'reading',
  cefrLevel: 'A2',
  language_id: ''
};

const defaultVocabulary = {
  language_id: '',
  word: '',
  pronunciation: '',
  meaning: '',
  example_sentence: '',
  example_translation: ''
};

const toCefrLevel = (value) => String(value || '').trim().toUpperCase();

/**
 * Công cụ tạo bài / nhập từ vựng của ADMIN.
 *
 * `embedded`: hiện bên trong trang Quản lý nội dung (bấm "Tạo bài mới") —
 * bỏ header, khối số liệu và nền riêng, chỉ giữ phần công cụ.
 */
function TeacherCreateContent({ embedded = false, onCreated } = {}) {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [mode, setMode] = useState('vocabulary');

  const [languages, setLanguages] = useState([]);
  const [courses, setCourses] = useState([]);
  const [vocabularies, setVocabularies] = useState([]);
  // Thung rac tu vung. DELETE la xoa MEM (dat is_deleted=1), ban ghi van con
  // trong CSDL; xoa han la buoc rieng va chi admin lam duoc.
  const [deletedVocabularies, setDeletedVocabularies] = useState([]);
  const [showDeletedVocab, setShowDeletedVocab] = useState(false);
  const [vocabBusyId, setVocabBusyId] = useState(null);
  const [vocabularyFile, setVocabularyFile] = useState(null);
  const [vocabularyPreviewRows, setVocabularyPreviewRows] = useState([]);
  const [vocabularyPreviewRaw, setVocabularyPreviewRaw] = useState('');
  const [vocabularyParseMeta, setVocabularyParseMeta] = useState(null);
  const [vocabularyUseAiValidation, setVocabularyUseAiValidation] = useState(false);
  const [vocabularyPreviewLoading, setVocabularyPreviewLoading] = useState(false);
  const [vocabularySaveLoading, setVocabularySaveLoading] = useState(false);

  const [courseForm, setCourseForm] = useState(defaultCourse);
  const [exerciseForm, setExerciseForm] = useState(defaultExercise);
  const [vocabularyForm, setVocabularyForm] = useState(defaultVocabulary);

  const [message, setMessage] = useState(null);
  const [createdExerciseInfos, setCreatedExerciseInfos] = useState([]);
  const [listeningAudioFile, setListeningAudioFile] = useState(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  // Bài đọc cho kỹ năng NÓI — đường riêng, xem ghi chú ở SPEAKING_SKILL.
  const [speakingForm, setSpeakingForm] = useState(defaultSpeakingPassage);
  const [speakingSaving, setSpeakingSaving] = useState(false);
  const [speakingMsg, setSpeakingMsg] = useState(null);
  const [exerciseFile, setExerciseFile] = useState(null);
  const [exerciseParts, setExerciseParts] = useState([]);
  const [exercisePreviewLoading, setExercisePreviewLoading] = useState(false);
  const [exerciseSelectedParts, setExerciseSelectedParts] = useState([]);
  const [vocabularyLoading, setVocabularyLoading] = useState(false);
  const [vocabularyMsg, setVocabularyMsg] = useState(null);
  const [vocabularyPreviewMsg, setVocabularyPreviewMsg] = useState(null);
  const [editingVocabulary, setEditingVocabulary] = useState(null);
  const [selectedPartForDetail, setSelectedPartForDetail] = useState(null);
  // Đề trắc nghiệm Word (.docx) Đọc / Nghe: kết quả quét chờ admin duyệt
  const [docxExam, setDocxExam] = useState(null);
  const [docxSaving, setDocxSaving] = useState(false);
  // Đề PDF quét Đọc / Nghe: phiên quét chạy nền trên server, xong thì admin duyệt
  const [scanKeyFile, setScanKeyFile] = useState(null);
  const [scanPages, setScanPages] = useState('');
  const [scanKeyPages, setScanKeyPages] = useState('');
  const [scanJob, setScanJob] = useState(null);       // { id, status, progress, queuePosition, log }
  const [scanExam, setScanExam] = useState(null);
  const scanCarry = useRef({});
  // lỗi khi lưu đề quét: { text, id } — id mới mỗi lần để hộp lỗi giữa màn hình hiện lại kể cả khi trùng lỗi cũ
  const [scanSaveError, setScanSaveError] = useState(null);
  const [scanSaving, setScanSaving] = useState(false);

  useEffect(() => {
    // Chỉ admin tạo bài (vai trò teacher đã bỏ).
    if (currentUser.role !== 'admin') {
      navigate('/');
      return;
    }

    api.get('/languages').then((res) => setLanguages(res.data)).catch(() => {});
    fetchCourses();
  }, []);

  // Hỏi tiến độ phiên quét PDF 3 giây một lần cho tới khi xong / lỗi.
  const scanJobId = scanJob?.id;
  const scanActive = scanJob && (scanJob.status === 'queued' || scanJob.status === 'running');
  useEffect(() => {
    if (!scanJobId || !scanActive) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const res = await api.get(`/exercises/scan-status/${scanJobId}`);
        if (stop) return;
        const job = res.data;
        if (job.status === 'done') {
          setScanJob(job);
          // gắn đáp án sau khi quét: giữ lại file nghe / tên phần admin đã chọn ở bước duyệt
          setScanExam(job.result ? { ...job.result, ...scanCarry.current } : job.result);
          scanCarry.current = {};
          const r = job.result || {};
          const n = r.questions?.length || 0;
          const img = (r.questions || []).filter((q) => q.display === 'image').length;
          const ans = (r.questions || []).filter((q) => q.correctAnswer).length;
          setMessage({ type: n ? 'success' : 'info', text: n
            ? `Quét xong: ${n} câu (${img} câu hiện ảnh gốc vì máy đọc không chắc), ${ans}/${n} câu có đáp án. Kiểm tra rồi bấm Lưu bài.`
            : 'Quét xong nhưng không nhận ra câu hỏi nào. Kiểm tra lại số trang đề.' });
        } else if (job.status === 'error') {
          setScanJob(job);
          setMessage({ type: 'error', text: `Quét thất bại: ${job.error || 'lỗi không rõ'}` });
        } else {
          setScanJob(job);
        }
      } catch (err) {
        if (stop) return;
        setScanJob((j) => (j ? { ...j, status: 'error', error: err.response?.data?.message || 'Mất kết nối tới server' } : j));
        setMessage({ type: 'error', text: err.response?.data?.message || 'Không hỏi được tiến độ quét' });
      }
    };
    const timer = setInterval(tick, 3000);
    tick();
    return () => { stop = true; clearInterval(timer); };
  }, [scanJobId, scanActive]);

  const fetchCourses = () => {
    api.get('/courses').then((res) => setCourses(res.data)).catch(() => {});
  };

  // Tu vung gan vao NGON NGU, khong gan vao bai hoc (xem models/Vocabulary.js).
  // Truoc day ham nay goi `?lessonId=` -> backend bo qua tham so do nen danh
  // sach tra ve TOAN BO tu cua moi ngon ngu, khong loc gi.
  const fetchVocabulary = (languageId) => {
    if (!languageId) {
      setVocabularies([]);
      setVocabularyLoading(false);
      return;
    }

    setVocabularyLoading(true);
    api.get(`/vocabulary?languageId=${languageId}`)
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

  const selectedExerciseLanguage = languages.find((lang) => String(lang.id) === String(exerciseForm.language_id));
  const isJapaneseExercise = String(selectedExerciseLanguage?.code || '').toLowerCase() === 'ja';
  const exerciseSkillOptions = isJapaneseExercise ? JAPANESE_SKILL_OPTIONS : SKILL_OPTIONS;
  const exercisePartOptions = isJapaneseExercise ? JAPANESE_PART_OPTIONS : [];

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

  /**
   * Lưu một bài đọc cho kỹ năng NÓI vào bảng `speaking_passages`.
   *
   * Không đi qua `/exercises/create-from-parts` vì không có file đề để quét —
   * văn bản đích do giáo viên nhập thẳng.
   *
   * KHÔNG gửi `has_prosody_ref`: server tự xác minh bằng cách hỏi dịch vụ chấm
   * xem câu nào thật sự có mốc người bản ngữ. Để client khai thì giao diện sẽ
   * hứa tiêu chí Ngữ điệu mà model không trả về.
   */
  const submitSpeakingPassage = async (e) => {
    e.preventDefault();
    setSpeakingMsg(null);

    const title = String(speakingForm.title || '').trim();
    const content = String(speakingForm.content || '').trim();
    if (!title) {
      setSpeakingMsg({ type: 'error', text: 'Nhập tên bài trước đã.' });
      return;
    }
    if (!content) {
      setSpeakingMsg({ type: 'error', text: 'Nhập ít nhất một dòng để đọc.' });
      return;
    }
    if (!exerciseForm.language_id) {
      setSpeakingMsg({ type: 'error', text: 'Chọn ngôn ngữ trước đã.' });
      return;
    }

    setSpeakingSaving(true);
    try {
      const res = await api.post('/speaking-passages', {
        language_id: Number(exerciseForm.language_id),
        kind: speakingForm.kind,
        title,
        topic: speakingForm.topic || null,
        level: speakingForm.level || null,
        content,                       // server tự tách dòng, hiểu "Vai: nội dung"
        source: speakingForm.source || null,
        license: speakingForm.license || null
      });
      const d = res.data || {};
      const nLines = Array.isArray(d.lines) ? d.lines.length : 0;
      const note = d.prosody_note ? ` ${d.prosody_note}` : '';
      setSpeakingMsg({
        type: 'success',
        text: `Đã lưu "${title}" với ${nLines} dòng.${note}`
      });
      setSpeakingForm(defaultSpeakingPassage);
    } catch (err) {
      setSpeakingMsg({
        type: 'error',
        text: err?.response?.data?.message || err.message || 'Không lưu được bài đọc.'
      });
    } finally {
      setSpeakingSaving(false);
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
        if (exerciseForm.language_id) formData.append('language_id', String(exerciseForm.language_id));
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
      // Nhúng trong Quản lý nội dung: báo để danh sách bài tải lại.
      if (onCreated) onCreated(createdItems);
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

  const handleExerciseLanguageChange = (languageId) => {
    const selectedLanguage = languages.find((lang) => String(lang.id) === String(languageId));
    const isJapanese = String(selectedLanguage?.code || '').toLowerCase() === 'ja';
    setExerciseForm((prev) => ({
      ...prev,
      language_id: languageId,
      skill: isJapanese ? 'vocabulary' : 'reading',
      cefrLevel: isJapanese ? 'N5' : prev.cefrLevel
    }));
  };

  const handleVocabularyLanguageChange = (languageId) => {
    setVocabularyForm((prev) => ({
      ...prev,
      language_id: languageId,
      word: '',
      pronunciation: '',
      meaning: '',
      example_sentence: '',
      example_translation: ''
    }));
    setVocabularies([]);
    resetVocabularyPreview();
    // Tu vung gan vao NGON NGU: doi ngon ngu la tai luon danh sach tu.
    fetchVocabulary(languageId);
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
    setDocxExam(null);
    if (scanJob && (scanJob.status === 'queued' || scanJob.status === 'running')) cancelPdfScan();
    setScanJob(null);
    setScanExam(null);
  };

  // Đề Word cho Đọc / Nghe đi đường riêng: bộ đọc cấu trúc + tự sửa lỗi gõ, rồi admin duyệt.
  const isDocxExamFlow = (file) => Boolean(file)
    && /\.docx$/i.test(file.name || '')
    && ['reading', 'listening'].includes(exerciseForm.skill);

  const previewDocxExam = async () => {
    setExercisePreviewLoading(true);
    setDocxExam(null);
    try {
      const formData = new FormData();
      formData.append('file', exerciseFile);
      const res = await api.post('/exercises/docx-preview', formData, { timeout: 90000 });
      setDocxExam(res.data);
      const w = (res.data?.warnings || []).length;
      showMsg(w ? 'info' : 'success', `Đọc được ${res.data?.questions?.length || 0} câu, tự sửa ${(res.data?.fixes || []).length} chỗ${w ? `, còn ${w} chỗ cần xem lại` : ''}. Kiểm tra rồi bấm Lưu bài.`);
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Không đọc được file Word');
    } finally {
      setExercisePreviewLoading(false);
    }
  };

  const saveDocxExam = async () => {
    const manualTitle = String(exerciseForm.title || '').trim();
    if (!manualTitle) { showMsg('error', 'Vui lòng nhập tên bài trước khi lưu.'); return; }
    setDocxSaving(true);
    try {
      const formData = new FormData();
      if (exerciseForm.course_id) formData.append('course_id', String(Number(exerciseForm.course_id)));
      if (exerciseForm.language_id) formData.append('language_id', String(exerciseForm.language_id));
      formData.append('exerciseTitle', manualTitle);
      formData.append('skill', exerciseForm.skill);
      formData.append('sourceFile', docxExam.fileName || '');
      formData.append('exam', JSON.stringify({ header: docxExam.header, timeLimitSec: docxExam.timeLimitSec, questions: docxExam.questions }));
      if (exerciseForm.skill === 'listening' && listeningAudioFile) formData.append('audioFile', listeningAudioFile);
      const res = await api.post('/exercises/docx-create', formData, { timeout: 60000 });
      const created = res.data?.created || [];
      showMsg('success', `Đã lưu bài "${manualTitle}" (${created[0]?.questionCount || 0} câu) vào kho bài tập.`);
      setDocxExam(null);
      setExerciseFile(null);
      setListeningAudioFile(null);
      if (onCreated) onCreated(created);
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Lưu bài thất bại');
    } finally {
      setDocxSaving(false);
    }
  };

  // Đề PDF cho Đọc / Nghe: bộ quét OCR trên server (đọc cả PDF scan), rồi admin duyệt.
  const isPdfScanFlow = (file) => Boolean(file)
    && /\.pdf$/i.test(file.name || '')
    && ['reading', 'listening'].includes(exerciseForm.skill);

  const startPdfScan = async () => {
    setScanSaveError(null);
    setScanExam(null);
    setScanJob(null);
    try {
      const formData = new FormData();
      formData.append('file', exerciseFile);
      if (scanKeyFile) formData.append('keyFile', scanKeyFile);
      formData.append('skill', exerciseForm.skill);
      if (exerciseForm.language_id) formData.append('language_id', String(exerciseForm.language_id));
      if (scanPages.trim()) formData.append('pages', scanPages.trim());
      if (scanKeyPages.trim()) formData.append('keyPages', scanKeyPages.trim());
      const res = await api.post('/exercises/scan-start', formData, { timeout: 120000 });
      setScanJob({ id: res.data.jobId, status: 'queued', progress: { done: 0, total: 0, step: 'đang chờ lượt quét' } });
      showMsg('info', 'Đã bắt đầu quét đề. Mỗi trang mất khoảng nửa phút; có thể để trang này mở và chờ.');
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Không bắt đầu quét được');
    }
  };

  // Quét xong mà thiếu đáp án: gắn file đáp án / trang đáp án, server chỉ đọc lại bảng đáp án
  // trên kết quả OCR đã có (không quét lại đề).
  const attachScanKey = async (keyFile, keyPages) => {
    const id = scanExam?.jobId;
    if (!id) return;
    try {
      const formData = new FormData();
      if (keyFile) formData.append('keyFile', keyFile);
      if (keyPages) formData.append('keyPages', keyPages);
      await api.post(`/exercises/scan-key/${id}`, formData, { timeout: 120000 });
      const { wholeAudio, partAudio, partTitles, split, timeLimitSec } = scanExam;
      scanCarry.current = { wholeAudio, partAudio, partTitles, split, timeLimitSec };
      setScanExam(null);
      setScanJob({ id, status: 'queued', progress: { done: 0, total: 0, step: 'đang đọc bảng đáp án' } });
      showMsg('info', 'Đang đọc bảng đáp án (dùng lại kết quả quét đề, không quét lại)…');
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Không gắn được file đáp án');
    }
  };

  const cancelPdfScan = async () => {
    const id = scanJob?.id;
    setScanJob(null);
    setScanExam(null);
    if (id) await api.delete(`/exercises/scan/${id}`).catch(() => {});
  };

  const saveScanExam = async () => {
    const manualTitle = String(exerciseForm.title || '').trim();
    if (!manualTitle) {
      setScanSaveError({ text: 'Chưa nhập tên bài (ô "Tên bài" ở đầu form).', id: Date.now() });
      showMsg('error', 'Vui lòng nhập tên bài trước khi lưu.');
      return;
    }
    setScanSaveError(null);
    setScanSaving(true);
    try {
      const formData = new FormData();
      if (exerciseForm.course_id) formData.append('course_id', String(Number(exerciseForm.course_id)));
      if (exerciseForm.language_id) formData.append('language_id', String(exerciseForm.language_id));
      formData.append('exerciseTitle', manualTitle);
      formData.append('skill', exerciseForm.skill);
      formData.append('jobId', scanExam.jobId);
      formData.append('sourceFile', scanExam.fileName || '');
      // bỏ phần ghi chú cho admin (`review`), chỉ gửi nội dung câu hỏi
      const listening = exerciseForm.skill === 'listening';
      // file nghe: mỗi phần một file (chọn ở dòng của phần) và/hoặc một file chung cho cả đề
      const plan = listening ? audioPlan(scanExam.questions, scanExam.wholeAudio, scanExam.partAudio) : { files: [], indexes: null };
      formData.append('exam', JSON.stringify({
        timeLimitSec: scanExam.timeLimitSec,
        questions: scanExam.questions.map(({ review, ...q }, i) => (
          plan.indexes ? { ...q, audioIndex: plan.indexes[i] } : q
        ))
      }));
      plan.files.forEach((f) => formData.append('audioFiles', f));
      // tách mỗi phần thành một bài (mặc định khi đề có nhiều phần)
      formData.append('split', String(scanExam.split !== false));
      formData.append('partTitles', JSON.stringify(scanExam.partTitles || []));
      const res = await api.post('/exercises/scan-create', formData, { timeout: 120000 });
      const created = res.data?.created || [];
      showMsg('success', created.length > 1
        ? `Đã lưu ${created.length} bài: ${created.map((c) => `"${c.exerciseTitle}" (${c.questionCount} câu)`).join(', ')}.`
        : `Đã lưu bài "${created[0]?.exerciseTitle || manualTitle}" (${created[0]?.questionCount || 0} câu) vào kho bài tập.`);
      // lưu xong: đóng màn duyệt, trả form tạo bài về trống (giữ ngôn ngữ / kỹ năng / khoá học để tạo bài tiếp),
      // cuộn lên đầu để thấy thông báo
      setScanExam(null);
      setScanJob(null);
      setExerciseFile(null);
      setScanKeyFile(null);
      setScanPages('');
      setScanKeyPages('');
      setScanSaveError(null);
      setListeningAudioFile(null);
      setExerciseForm((prev) => ({ ...prev, title: '' }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (onCreated) onCreated(created);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error
        || (err.code === 'ECONNABORTED' ? 'Hết thời gian chờ khi gửi file (file nghe quá lớn hoặc mạng chậm)' : 'Lưu bài thất bại');
      const list = err.response?.data?.problems;
      setScanSaveError({ text: msg, problems: Array.isArray(list) ? list : [], id: Date.now() });
      showMsg('error', msg);
    } finally {
      setScanSaving(false);
    }
  };

  const previewExerciseFile = async () => {
    if (!exerciseFile) {
      showMsg('error', 'Vui lòng chọn file PDF hoặc DOCX.');
      return;
    }
    if (isDocxExamFlow(exerciseFile)) { await previewDocxExam(); return; }
    if (isPdfScanFlow(exerciseFile)) { await startPdfScan(); return; }
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
    if (!vocabularyForm.language_id) {
      setVocabularyPreviewMsg({ type: 'error', text: 'Chọn ngôn ngữ trước khi lưu.' });
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
      // Tu vung gan vao NGON NGU, khong gan vao bai hoc (xem
      // models/Vocabulary.js). Truoc day gui `lesson_id` -> backend tra 400.
      await api.post('/vocabulary/import-batch', {
        language_id: vocabularyForm.language_id ? Number(vocabularyForm.language_id) : null,
        items: normalizedItems
      });

      setVocabularyMsg({ type: 'success', text: `Đã lưu ${normalizedItems.length} từ vựng từ file.` });
      setVocabularyPreviewMsg({ type: 'success', text: 'Lưu thành công. Bảng preview đã được làm mới.' });
      resetVocabularyPreview();
      fetchVocabulary(vocabularyForm.language_id);
    } catch (err) {
      setVocabularyPreviewMsg({ type: 'error', text: err.response?.data?.message || 'Lưu từ vựng từ file thất bại' });
    } finally {
      setVocabularySaveLoading(false);
    }
  };

  /** Tai danh sach tu da xoa mem (thung rac). */
  const fetchDeletedVocabulary = (languageId) => {
    api.get(`/vocabulary/deleted${languageId ? `?languageId=${languageId}` : ''}`)
      .then((res) => setDeletedVocabularies(res.data || []))
      .catch(() => setDeletedVocabularies([]));
  };

  /**
   * Xoa MEM mot tu. Ban ghi van con trong CSDL va khoi phuc duoc, nen khong
   * can hoi xac nhan gat gao — chi bao ro la co the hoan tac.
   */
  const handleDeleteVocabulary = async (item) => {
    if (!window.confirm(`Xóa từ "${item.word}"? Từ sẽ vào thùng rác và khôi phục lại được.`)) return;
    setVocabBusyId(item.id);
    try {
      await api.delete(`/vocabulary/${item.id}`);
      setVocabularyMsg({ type: 'success', text: `Đã chuyển "${item.word}" vào thùng rác.` });
      fetchVocabulary(vocabularyForm.language_id);
      if (showDeletedVocab) fetchDeletedVocabulary(vocabularyForm.language_id);
    } catch (err) {
      setVocabularyMsg({ type: 'error', text: err.response?.data?.message || 'Xóa thất bại' });
    } finally {
      setVocabBusyId(null);
    }
  };

  const handleRestoreVocabulary = async (item) => {
    setVocabBusyId(item.id);
    try {
      await api.patch(`/vocabulary/${item.id}/restore`);
      setVocabularyMsg({ type: 'success', text: `Đã khôi phục "${item.word}".` });
      fetchDeletedVocabulary(vocabularyForm.language_id);
      fetchVocabulary(vocabularyForm.language_id);
    } catch (err) {
      setVocabularyMsg({ type: 'error', text: err.response?.data?.message || 'Khôi phục thất bại' });
    } finally {
      setVocabBusyId(null);
    }
  };

  /**
   * Xoa HAN khoi CSDL. Khong hoan tac duoc.
   *
   * Chi hoi xac nhan mot lan. An toan van con o cho khac: muon toi duoc day
   * thi tu phai DA nam trong thung rac (backend tu choi xoa han mot tu dang
   * dung), nen khong the mat du lieu chi bang mot lan bam nham.
   */
  const handlePurgeVocabulary = async (item) => {
    if (!window.confirm(`XÓA HẲN "${item.word}" khỏi cơ sở dữ liệu?

Không khôi phục lại được.`)) return;
    setVocabBusyId(item.id);
    try {
      await api.delete(`/vocabulary/${item.id}/permanent`);
      setVocabularyMsg({ type: 'success', text: `Đã xóa hẳn "${item.word}".` });
      fetchDeletedVocabulary(vocabularyForm.language_id);
    } catch (err) {
      setVocabularyMsg({ type: 'error', text: err.response?.data?.message || 'Xóa hẳn thất bại' });
    } finally {
      setVocabBusyId(null);
    }
  };

  const handleEditVocabulary = (item) => {
    setEditingVocabulary(item.id);
    const nextLanguageId = item.language_id ? String(item.language_id) : '';
    setVocabularyForm({
      language_id: nextLanguageId,
      word: item.word || '',
      pronunciation: item.pronunciation || '',
      meaning: item.meaning || '',
      example_sentence: item.example_sentence || '',
      example_translation: item.example_translation || ''
    });
    setMode('vocabulary');
    if (nextLanguageId) {
      fetchVocabulary(nextLanguageId);
    }
  };

  const resetVocabularyDraft = () => {
    setEditingVocabulary(null);
    setVocabularyForm((prev) => ({
      ...defaultVocabulary,
      language_id: prev.language_id
    }));
  };

  const submitVocabulary = async (e) => {
    e.preventDefault();
    setVocabularyMsg(null);

    if (!vocabularyForm.language_id) {
      setVocabularyMsg({ type: 'error', text: 'Vui lòng chọn ngôn ngữ trước khi lưu từ.' });
      return;
    }
    if (!vocabularyForm.word.trim() || !vocabularyForm.meaning.trim()) {
      setVocabularyMsg({ type: 'error', text: 'Vui lòng nhập từ và nghĩa.' });
      return;
    }

    try {
      const payload = {
        language_id: vocabularyForm.language_id ? Number(vocabularyForm.language_id) : null,
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

      fetchVocabulary(vocabularyForm.language_id);
      setEditingVocabulary(null);
      setVocabularyForm((prev) => ({
        ...defaultVocabulary,
        language_id: prev.language_id
      }));
    } catch (err) {
      setVocabularyMsg({ type: 'error', text: err.response?.data?.message || 'Lưu từ vựng thất bại' });
    }
  };


  return (
    <div style={embedded ? undefined : styles.wrapper}>
      {!embedded && (
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button onClick={() => navigate('/admin/content')} style={styles.backBtn}>← Quay lại</button>
          <div>
            <div style={styles.logo}>Tạo nội dung</div>
          </div>
        </div>
        <span style={styles.welcomeText}>Admin: <strong>{currentUser.username}</strong></span>
      </div>
      )}

      <div style={embedded ? undefined : styles.content}>
        {!embedded && (
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
        )}

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

        {mode === 'vocabulary' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Tạo / cập nhật Vocabulary</h3>
            <p style={styles.hintText}>Upload file PDF hoặc DOCX, hệ thống sẽ quét nội dung và cho bạn xem trước dưới dạng bảng.</p>

            {vocabularyMsg && <div style={vocabularyMsg.type === 'success' ? styles.successBanner : styles.errorBanner}>{vocabularyMsg.text}</div>}
            {vocabularyPreviewMsg && <div style={vocabularyPreviewMsg.type === 'success' ? styles.successBanner : styles.errorBanner}>{vocabularyPreviewMsg.text}</div>}

            <div style={styles.uploadBox}>
              {/* Tu vung gan vao NGON NGU. Truoc day cho day co them o "Chon
                * lesson" va "Ten chu de" — da bo cung voi khai niem bai hoc. */}
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
                    {vocabularySaveLoading ? 'Đang lưu...' : 'Lưu toàn bộ'}
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
            {!vocabularyLoading && vocabularyForm.language_id && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={styles.subTitle}>Danh sách từ vựng - {languages.find((l) => String(l.id) === String(vocabularyForm.language_id))?.name || ''}</h4>
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
                              <button
                                type="button"
                                onClick={() => handleDeleteVocabulary(item)}
                                disabled={vocabBusyId === item.id}
                                style={{ ...styles.secondaryBtn, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}
                              >
                                {vocabBusyId === item.id ? '...' : 'Xóa'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {vocabularies.length === 0 && (
                        <tr>
                          <td colSpan={7} style={styles.emptyCell}>Chưa có từ vựng cho ngôn ngữ này.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* THÙNG RÁC — xóa mềm giữ bản ghi lại, nên phải có chỗ xem và
                  * khôi phục. Không có khối này thì từ đã xóa biến mất khỏi
                  * giao diện mà vẫn nằm trong CSDL, và còn chặn việc thêm lại
                  * từ cùng tên vì ràng buộc duy nhất (language_id, word). */}
                <div style={{ marginTop: '16px' }}>
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={() => {
                      const next = !showDeletedVocab;
                      setShowDeletedVocab(next);
                      if (next) fetchDeletedVocabulary(vocabularyForm.language_id);
                    }}
                  >
                    {showDeletedVocab ? 'Ẩn thùng rác' : `Thùng rác${deletedVocabularies.length ? ` (${deletedVocabularies.length})` : ''}`}
                  </button>

                  {showDeletedVocab && (
                    <div style={{ marginTop: '10px' }}>
                      <p style={styles.helperText}>
                        Từ trong thùng rác không hiện cho người học. Khôi phục được
                        bất cứ lúc nào. Xóa hẳn thì không lấy lại được.
                      </p>
                      <div style={styles.tableWrapper}>
                        <table style={styles.table}>
                          <thead>
                            <tr style={styles.tableHeadRow}>
                              <th style={styles.th}>Từ</th>
                              <th style={styles.th}>Nghĩa</th>
                              <th style={styles.th}>Ngôn ngữ</th>
                              <th style={styles.th}>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deletedVocabularies.map((item) => (
                              <tr key={item.id} style={styles.tableRow}>
                                <td style={styles.td}><strong>{item.word}</strong></td>
                                <td style={styles.td}>{item.meaning}</td>
                                <td style={styles.td}>{item.language?.name || item.language_id}</td>
                                <td style={styles.td}>
                                  <div style={styles.actionGroup}>
                                    <button
                                      type="button"
                                      onClick={() => handleRestoreVocabulary(item)}
                                      disabled={vocabBusyId === item.id}
                                      style={{ ...styles.secondaryBtn, borderColor: '#bbf7d0', background: '#f0fdf4', color: '#15803d' }}
                                    >
                                      Khôi phục
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handlePurgeVocabulary(item)}
                                      disabled={vocabBusyId === item.id}
                                      style={{ ...styles.secondaryBtn, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}
                                    >
                                      Xóa hẳn
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {deletedVocabularies.length === 0 && (
                              <tr>
                                <td colSpan={4} style={styles.emptyCell}>Thùng rác trống.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'exercise' && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Tạo Exercise</h3>
            <p style={styles.hintText}>Giáo viên chọn kỹ năng. Hệ thống sẽ quét file, tách phần nội dung và tạo một bài riêng cho mỗi phần đã chọn.</p>
            {generateLoading && (
              <div style={styles.loadingBanner}>
                <span style={styles.loadingDot} />
                Đang tạo bài, vui lòng chờ...
              </div>
            )}
            {/* Hai cột BẰNG NHAU (minmax 0): cột `auto` cũ giãn theo nội dung rộng nhất (khung quét PDF)
              * và ép các ô còn lại thành một dải hẹp. Khối file nghe / file đề chiếm cả hàng. */}
            <form onSubmit={submitExercise} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', alignItems: 'end' }}>
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
                      if (!['listening'].includes(nextSkill)) {
                      setListeningAudioFile(null);
                    }
                  }}
                >
                  {exerciseSkillOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: '12px' }}>
                <label style={styles.label}>Ngôn ngữ bài</label>
                <select
                  style={styles.input}
                  value={exerciseForm.language_id}
                  onChange={(e) => handleExerciseLanguageChange(e.target.value)}
                >
                  <option value="">-- Chọn ngôn ngữ --</option>
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id}>{lang.name}</option>
                  ))}
                </select>
              </div>

              {isJapaneseExercise && (
                <div style={{ marginTop: '12px' }}>
                  <label style={styles.label}>Bậc</label>
                  <select
                    style={styles.input}
                    value={exerciseForm.cefrLevel}
                    onChange={(e) => setExerciseForm((p) => ({ ...p, cefrLevel: e.target.value }))}
                  >
                    {exercisePartOptions.map((part) => (
                      <option key={part} value={part}>{part}</option>
                    ))}
                  </select>
                </div>
              )}

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
            {/* Đề nghe dạng PDF quét: QUÉT ĐỀ TRƯỚC, gán file nghe ở bước duyệt (một file hoặc mỗi phần một file). */}
            {exerciseForm.skill === 'listening' && !isPdfScanFlow(exerciseFile) && (
              <div style={{ marginTop: '12px', gridColumn: '1 / -1' }}>
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
                {!listeningAudioFile && <div style={styles.helperText}>Bài nghe cần file âm thanh (chọn trước khi lưu bài).</div>}
              </div>
            )}

            {/* Quét file đề: CHỈ cho Nghe / Đọc / Viết / Ngữ pháp / Từ vựng.
              * Kỹ năng NÓI không có đề để quét — xem ghi chú ở SPEAKING_SKILL. */}
            <div style={{ marginTop: '12px', gridColumn: '1 / -1', display: exerciseForm.skill === SPEAKING_SKILL ? 'none' : 'block' }}>
              <label style={styles.label}>Tải file đề (PDF/DOCX) để quét nội dung</label>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={styles.input}
                onChange={(e) => handleExerciseFileChange(e.target.files?.[0] || null)}
              />
              {isPdfScanFlow(exerciseFile) && (
                <div style={{ marginTop: '10px', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div style={styles.helperText}>
                    Đề PDF được quét bằng OCR ngay trên máy chủ (đọc được cả bản scan), đề 14 trang mất khoảng 2 phút. Chỗ máy đọc không chắc sẽ hiện bằng ảnh gốc của đề.
                    {exerciseForm.skill === 'listening' && ' Bài nghe: quét đề trước, sau đó gán file nghe ở bước duyệt (một file cho cả đề hoặc mỗi phần một file).'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '8px', alignItems: 'end' }}>
                    <div>
                      <label style={styles.label}>Trang đề cần quét</label>
                      <input style={styles.input} value={scanPages} onChange={(e) => setScanPages(e.target.value)} placeholder="vd: 3-16 (để trống = mọi trang)" />
                    </div>
                    <div>
                      <label style={styles.label}>File đáp án riêng (PDF, nếu đáp án không nằm trong file đề)</label>
                      <input type="file" accept=".pdf,application/pdf" style={styles.input} onChange={(e) => setScanKeyFile(e.target.files?.[0] || null)} />
                    </div>
                    <div>
                      <label style={styles.label}>Trang có bảng đáp án (không bắt buộc)</label>
                      <input style={styles.input} value={scanKeyPages} onChange={(e) => setScanKeyPages(e.target.value)} placeholder={scanKeyFile ? 'để trống = mọi trang của file đáp án' : 'để trống = tự tìm ở cuối file đề'} />
                    </div>
                  </div>
                  <div style={styles.helperText}>
                    Đáp án lấy theo thứ tự: file đáp án riêng (nếu có tải lên) → bảng đáp án ở cuối file đề (tự tìm, trang đáp án không bị coi là trang đề).
                    Không tìm thấy thì chọn đáp án ở bước duyệt. Bỏ trang bìa / trang trắng để không sinh câu rác.
                    {exerciseForm.skill === 'listening' && !scanKeyFile && ' Bài nghe nên có file đáp án: phần chỉ nghe không in câu nào (vd もんだい4) chỉ biết số câu nhờ bảng đáp án. Quên thì vẫn gắn được ở bước duyệt, không phải quét lại.'}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={previewExerciseFile} style={styles.submitBtn} disabled={exercisePreviewLoading || !exerciseFile || scanActive}>
                  {exercisePreviewLoading || scanActive ? 'Đang quét...' : 'Quét nội dung'}
                </button>
                <button type="button" onClick={() => { handleExerciseFileChange(null); setScanKeyFile(null); }} style={styles.cancelBtn}>
                  Xóa
                </button>
              </div>

              {scanActive && (
                <div style={{ marginTop: '10px', padding: '12px', borderRadius: '10px', border: '1px solid #bae6fd', background: '#f0f9ff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', color: '#0c4a6e' }}>
                    <span>
                      {scanJob.status === 'queued'
                        ? `Đang chờ lượt quét${scanJob.queuePosition ? ` (còn ${scanJob.queuePosition} đề trước)` : ''}…`
                        : `Đang ${scanJob.progress?.step || 'quét'}…`}
                    </span>
                    <span>{scanJob.progress?.total ? `${scanJob.progress.done}/${scanJob.progress.total}` : ''}</span>
                  </div>
                  <div style={{ height: '8px', borderRadius: '999px', background: '#e0f2fe', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#0284c7', width: `${scanJob.progress?.total ? Math.round(100 * scanJob.progress.done / scanJob.progress.total) : 3}%`, transition: 'width .4s' }} />
                  </div>
                  <button type="button" onClick={cancelPdfScan} style={{ ...styles.cancelBtn, marginTop: '8px' }}>Huỷ quét</button>
                </div>
              )}

              {scanExam && (
                <ScanExamReview
                  data={scanExam}
                  onChange={setScanExam}
                  onSave={saveScanExam}
                  onCancel={cancelPdfScan}
                  onAttachKey={attachScanKey}
                  saveError={scanSaveError}

                  saving={scanSaving}
                  needAudio={exerciseForm.skill === 'listening'}
                />
              )}

              {docxExam && (
                <DocxExamReview
                  data={docxExam}
                  onChange={setDocxExam}
                  onSave={saveDocxExam}
                  onCancel={() => setDocxExam(null)}
                  saving={docxSaving}
                  needAudio={exerciseForm.skill === 'listening'}
                  audioFile={listeningAudioFile}
                />
              )}

              {!docxExam && exerciseParts.length > 0 && (
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

            {/* ============ KỸ NĂNG NÓI — đường riêng ============
              * Model chấm phát âm so bản ghi với VĂN BẢN ĐÍCH biết trước, nên
              * không quét file đề. Giáo viên nhập thẳng từng dòng.
              * Lưu vào `speaking_passages`, KHÔNG vào `exercises`. */}
            {exerciseForm.skill === SPEAKING_SKILL && (
              <form onSubmit={submitSpeakingPassage} style={{ marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #e2e8f0' }}>
                <h4 style={styles.subTitle}>Bài đọc cho kỹ năng Nói</h4>
                <p style={styles.hintText}>
                  Kỹ năng Nói không quét file đề. Model chấm phát âm cần biết
                  trước người học phải đọc câu gì, nên bạn nhập thẳng nội dung.
                  <strong> Mỗi dòng là một lần đọc và được chấm riêng.</strong>
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={styles.label}>Dạng bài</label>
                    <select
                      style={styles.input}
                      value={speakingForm.kind}
                      onChange={(e) => setSpeakingForm((p) => ({ ...p, kind: e.target.value }))}
                    >
                      <option value="passage">Đoạn văn (đọc liền mạch)</option>
                      <option value="dialogue">Hội thoại (nhiều vai)</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Tên bài</label>
                    <input
                      style={styles.input}
                      value={speakingForm.title}
                      onChange={(e) => setSpeakingForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Ví dụ: Hội thoại ở cửa hàng"
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Chủ đề (tuỳ chọn)</label>
                    <input
                      style={styles.input}
                      value={speakingForm.topic}
                      onChange={(e) => setSpeakingForm((p) => ({ ...p, topic: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Trình độ (tuỳ chọn)</label>
                    <input
                      style={styles.input}
                      value={speakingForm.level}
                      onChange={(e) => setSpeakingForm((p) => ({ ...p, level: e.target.value }))}
                      placeholder={isJapaneseExercise ? 'N5, N4...' : 'A2, B1...'}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label style={styles.label}>
                    Nội dung — mỗi dòng một câu
                    {speakingForm.kind === 'dialogue' && ' (viết "Vai: nội dung")'}
                  </label>
                  <textarea
                    style={{ ...styles.input, minHeight: '160px', fontFamily: 'inherit' }}
                    value={speakingForm.content}
                    onChange={(e) => setSpeakingForm((p) => ({ ...p, content: e.target.value }))}
                    placeholder={speakingForm.kind === 'dialogue'
                      ? 'A: すみません、えきはどこですか\nB: あそこです'
                      : (isJapaneseExercise
                        ? 'あかいいすでたべる\nくらいえきでたべる'
                        : 'The weather is nice today.\nI walk to school every morning.')}
                  />
                  <div style={styles.helperText}>
                    {isJapaneseExercise
                      ? 'Tiếng Nhật: chỉ những câu có mốc người bản ngữ mới chấm được tiêu chí Ngữ điệu. Server tự kiểm và báo lại sau khi lưu — bạn không cần tự đánh dấu.'
                      : 'Tiếng Anh: nên giữ 4–10 từ mỗi câu. Model train trên câu dài tối đa 10 từ; câu dài hơn là dùng model ngoài miền và điểm mất ý nghĩa.'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div>
                    <label style={styles.label}>Nguồn</label>
                    <input
                      style={styles.input}
                      value={speakingForm.source}
                      onChange={(e) => setSpeakingForm((p) => ({ ...p, source: e.target.value }))}
                      placeholder="Ví dụ: Tatoeba, hoặc tự soạn"
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Giấy phép</label>
                    <input
                      style={styles.input}
                      value={speakingForm.license}
                      onChange={(e) => setSpeakingForm((p) => ({ ...p, license: e.target.value }))}
                      placeholder="Ví dụ: CC BY 2.0 FR"
                    />
                  </div>
                </div>
                <div style={{ ...styles.helperText, marginTop: '6px' }}>
                  ⚠️ Không nạp nội dung có bản quyền (Minna no Nihongo và các
                  giáo trình khác). Nguồn mở dùng được: Tatoeba (CC BY), hoặc
                  tự soạn.
                </div>

                {speakingMsg && (
                  <div style={{
                    marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
                    background: speakingMsg.type === 'error' ? '#fef2f2' : '#f0fdf4',
                    color: speakingMsg.type === 'error' ? '#b91c1c' : '#15803d',
                    border: `1px solid ${speakingMsg.type === 'error' ? '#fecaca' : '#bbf7d0'}`
                  }}>
                    {speakingMsg.text}
                  </div>
                )}

                <button type="submit" style={{ ...styles.submitBtn, marginTop: '12px' }} disabled={speakingSaving}>
                  {speakingSaving ? 'Đang lưu...' : 'Lưu bài đọc'}
                </button>
              </form>
            )}

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
    background: '#f8fafc',
    color: '#0f172a',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
  },
  header: {
    background: '#ffffff',
    backdropFilter: 'blur(14px)',
    borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
    padding: '16px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#0f172a',
    position: 'sticky',
    top: 0,
    zIndex: 20
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  backBtn: {
    background: '#f1f5f9',
    color: '#334155',
    border: '1px solid #e2e8f0',
    padding: '9px 16px',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  logo: { fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: '12px', color: 'rgba(226, 232, 240, 0.82)', marginTop: '2px' },
  welcomeText: { fontSize: '14px', color: '#475569' },
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
    background: '#ffffff',
    border: '1px solid #f1f5f9',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)'
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
    background: '#2563eb',
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
    borderRadius: '16px',
    padding: '22px',
    boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
    border: '1px solid #f1f5f9'
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
    background: '#2563eb',
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
  tableHeadRow: { background: '#2563eb', color: '#fff' },
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
