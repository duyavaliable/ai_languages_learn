import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import RegisterTeacherPage from './pages/RegisterTeacher';
import RegisterAdminPage from './pages/RegisterAdmin';
import HomePage from './pages/HomePage';
import AdminAccountManager from './pages/AdminAccountManager';
import AdminContentManager from './pages/AdminContentManager';
import TeacherCreateContent from './pages/TeacherCreateContent';
import CourseSkillsPage from './pages/CourseSkillsPage';
import SkillExercisesPage from './pages/SkillExercisesPage';
import ExerciseAttemptPage from './pages/ExerciseAttemptPage';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register-teacher" element={<RegisterTeacherPage />} />
        <Route path="/register-admin" element={<RegisterAdminPage />} />
        <Route

          path="/"
          element={
            <PrivateRoute>
              <HomePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <PrivateRoute>
              <AdminAccountManager />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/content"
          element={
            <PrivateRoute>
              <AdminContentManager />
            </PrivateRoute>
          }
        />
        <Route
          path="/teacher/create-content"
          element={
            <PrivateRoute>
              <TeacherCreateContent />
            </PrivateRoute>
          }
        />
        <Route
          path="/courses/:courseId/skills"
          element={
            <PrivateRoute>
              <CourseSkillsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/courses/:courseId/skills/:skill/exercises"
          element={
            <PrivateRoute>
              <SkillExercisesPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/courses/:courseId/skills/:skill/exercises/:lessonId"
          element={
            <PrivateRoute>
              <ExerciseAttemptPage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;