import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Headphones,
  PenTool,
  Search,
  Sparkles,
  ShieldCheck,
  LogOut,
  Users,
  LibraryBig,
  Palette,
  Clock,
  ChevronRight,
  Mic2
} from 'lucide-react';
import api from '../services/api';

const skillMeta = {
  reading: { label: 'Reading', icon: BookOpen, image: 'public/images/reading-illustration.png', badge: 'bg-primary/10 text-primary' },
  listening: { label: 'Listening', icon: Headphones, image: 'public/images/listening-illustration.png', badge: 'bg-accent/10 text-accent' },
  writing: { label: 'Writing', icon: PenTool, image: 'public/images/writing-illustration.png', badge: 'bg-warning/10 text-warning' },
  speaking: { label: 'Speaking', icon: Mic2, image: 'public/images/speaking-illustration.png', badge: 'bg-success/10 text-success' }
};

const partCountBySkill = { reading: 4, listening: 3, speaking: 2, writing: 2 };

const getExercisePart = (exercise) => {
  const base = Number(exercise?.id) || 1;
  const partCount = partCountBySkill[exercise?.skill_type] || 3;
  const mod = base % partCount;
  return mod === 0 ? partCount : mod;
};

function HomePage() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedParts, setSelectedParts] = useState([]);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    api.get('/exercises')
      .then((exerciseRes) => {
        setExercises(exerciseRes.data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError('Không thể tải danh sách bài tập');
        setLoading(false);
        console.error(err);
      });
  }, []);

  const partOptions = useMemo(() => {
    const fallbackCount = Math.max(...Object.values(partCountBySkill));
    const partCount = selectedSkill ? (partCountBySkill[selectedSkill] || 0) : fallbackCount;
    return Array.from({ length: partCount }, (_, index) => index + 1);
  }, [selectedSkill]);

  useEffect(() => {
    if (!selectedSkill) {
      setSelectedParts([]);
      return;
    }

    const partCount = partCountBySkill[selectedSkill] || 0;
    setSelectedParts((prev) => prev.filter((part) => part <= partCount));
  }, [selectedSkill]);

  const filteredExercises = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let items = exercises.slice();

    if (selectedSkill) {
      items = items.filter((exercise) => exercise.skill_type === selectedSkill);
    }

    if (selectedParts.length > 0) {
      items = items.filter((exercise) => selectedParts.includes(getExercisePart(exercise)));
    }

    if (!query) return items;

        return items.filter((exercise) => [exercise.title, exercise.skill_type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)));
  }, [exercises, searchQuery, selectedParts, selectedSkill]);

  const handleSelectSkill = (skill) => {
    setSelectedSkill(selectedSkill === skill ? '' : skill);
  };

  const handleTogglePart = (part) => {
    setSelectedParts((prev) => (prev.includes(part) ? prev.filter((item) => item !== part) : [...prev, part]));
  };

  const handleOpenExercise = (exercise) => {
    if (!exercise?.skill_type) return;
    const courseId = Number(exercise?.course_id) || 1;
    navigate(`/courses/${courseId}/skills/${exercise.skill_type}/exercises/${exercise.id}`);
  };

  const getExerciseDescription = () => 'Bài tập luyện kỹ năng theo từng phần.';

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-card/90 backdrop-blur-xl shadow-sticky">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-elegant">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-bold leading-none">AI Languages Learn</div>
              <div className="text-xs text-muted-foreground">Practice tests & exercises</div>
            </div>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground md:flex">
              <ShieldCheck className="h-4 w-4 text-success" />
              Xin chào, <span className="font-semibold text-foreground">{user.username || 'người dùng'}</span>
            </div>
            {user.role === 'admin' && (
              <button onClick={() => navigate('/admin/users')} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:border-primary hover:text-primary">
                <Users className="h-4 w-4" />
                Tài khoản
              </button>
            )}
            {user.role === 'admin' && (
              <button onClick={() => navigate('/admin/content')} className="hidden items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:border-primary hover:text-primary sm:inline-flex">
                <LibraryBig className="h-4 w-4" />
                Nội dung
              </button>
            )}
            {user.role === 'teacher' && (
              <button onClick={() => navigate('/teacher/create-content')} className="hidden items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:border-primary hover:text-primary sm:inline-flex">
                <Palette className="h-4 w-4" />
                Tạo bài tập
              </button>
            )}
            <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-full gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant transition-smooth hover:shadow-glow">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-6 rounded-[32px] border border-border bg-card p-6 shadow-card sm:p-7 lg:flex-row">
          <aside className="w-full max-w-xs rounded-[24px] border border-border bg-background p-5 shadow-card">
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skill</h3>
                <div className="space-y-1">
                  {Object.keys(skillMeta).map((skillKey) => {
                    const meta = skillMeta[skillKey];
                    const Icon = meta.icon;
                    const active = selectedSkill === skillKey;
                    return (
                      <button
                        key={skillKey}
                        onClick={() => handleSelectSkill(skillKey)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-smooth ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                      >
                        <Icon className="h-4 w-4" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Part</h3>
                <div className="flex flex-wrap gap-2">
                  {partOptions.map((part) => (
                    <button
                      key={part}
                      onClick={() => handleTogglePart(part)}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-smooth ${selectedParts.includes(part) ? 'gradient-primary text-primary-foreground shadow-elegant' : 'border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary'}`}
                    >
                      {part}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <div className="flex-1">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Exercises</p>
                <h2 className="mt-1 text-2xl font-bold">Practice Tests & Exercises</h2>
              </div>
              <div className="flex w-full max-w-md items-center gap-3 sm:w-auto">
                <div className="relative flex-1 sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search exercises..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-11 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm outline-none transition-smooth focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="hidden rounded-full border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground lg:block">
                  {filteredExercises.length} exercises found
                </div>
              </div>
            </div>

            {loading && <p className="py-12 text-center text-sm text-muted-foreground">Đang tải...</p>}
            {error && <p className="py-12 text-center text-sm text-destructive">{error}</p>}
            {!loading && !error && filteredExercises.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">Chưa có bài tập nào phù hợp.</p>
            )}

            {!loading && !error && filteredExercises.length > 0 && (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredExercises.map((exercise) => {
                  const meta = skillMeta[exercise.skill_type] || skillMeta.reading;
                  const Icon = meta.icon;
                  const part = getExercisePart(exercise);
                  const duration = Math.max(1, Math.round((exercise.time_limit_sec || 600) / 60));
                  return (
                    <button
                      key={exercise.id}
                      onClick={() => handleOpenExercise(exercise)}
                      className="group overflow-hidden rounded-[24px] border border-border bg-background text-left shadow-card transition-smooth hover:-translate-y-1 hover:shadow-card-hover"
                    >
                      <div className="relative h-36 overflow-hidden">
                        <img src={meta.image} alt={exercise.title} className="h-full w-full object-cover transition-smooth group-hover:scale-105" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-end text-xs">
                          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground backdrop-blur-sm">Part {part}</span>
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="mb-2.5 flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.badge}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {meta.label}
                          </span>
                        </div>
                        <h3 className="mb-1.5 text-sm font-semibold leading-snug text-foreground line-clamp-2 transition-smooth group-hover:text-primary">{exercise.title}</h3>
                        <p className="mb-3 text-xs text-muted-foreground line-clamp-2">{getExerciseDescription(exercise)}</p>
                        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{duration}m</span>
                          <span className="inline-flex items-center gap-1 text-primary">Start <ChevronRight className="h-4 w-4" /></span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default HomePage;
