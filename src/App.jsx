import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import RegisterAdminPage from './pages/RegisterAdmin';
import HomePage from './pages/HomePage';
import AdminAccountManager from './pages/AdminAccountManager';
import AdminContentManager from './pages/AdminContentManager';
import AdminExerciseEditor from './pages/AdminExerciseEditor';
import SpeakingPracticePage from './pages/SpeakingPracticePage.jsx';
import ExerciseAttemptPage from './pages/ExerciseAttemptPage';
import ProfilePage from './pages/ProfilePage';
import PrivateRoute from './components/PrivateRoute';

// Chế độ tối đã bỏ: giao diện chỉ có một bảng màu sáng. Gỡ class `dark` và
// lựa chọn cũ mà ThemeProvider (đã xoá) có thể đã lưu trên máy người dùng.
document.documentElement.classList.remove('dark');
try { localStorage.removeItem('lingua-theme'); } catch { /* bỏ qua */ }

function App() {
  return (
      <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register-admin" element={<RegisterAdminPage />} />
        <Route

          path="/"
          element={
            <PrivateRoute>
              <HomePage />
            </PrivateRoute>
          }
        />
        {/* Hồ sơ của tôi (menu tài khoản ở góc phải) */}
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <ProfilePage />
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
        {/* Tạo bài mới nằm TRONG Quản lý nội dung (nút "Tạo bài mới"). Hai
            đường cũ chuyển về đó; vai trò teacher đã bỏ. */}
        <Route path="/admin/create-content" element={<Navigate to="/admin/content?create=1" replace />} />
        <Route path="/teacher/create-content" element={<Navigate to="/admin/content?create=1" replace />} />
        <Route
          path="/admin/exercises/:exerciseId/edit"
          element={
            <PrivateRoute>
              <AdminExerciseEditor />
            </PrivateRoute>
          }
        />
        {/*
          Khai niem "khoa hoc" da bo khoi duong dan. Nguoi hoc chua bao gio
          CHON khoa: trang chu liet ke thang bai tap, loc theo ky nang va ngon
          ngu, con `course_id` chi la mot manh URL lay tu chinh bai tap do.
          Cot `exercises.course_id` GIU NGUYEN trong CSDL -- day chi la thay
          doi duong dan, khong xoa du lieu.
        */}
        <Route
          path="/exercises/:exerciseId"
          element={
            <PrivateRoute>
              <ExerciseAttemptPage />
            </PrivateRoute>
          }
        />
        {/* Doc to theo van ban cho san -> trang cham phat am rieng. */}
        <Route
          path="/speaking/:exerciseId"
          element={
            <PrivateRoute>
              <SpeakingPracticePage />
            </PrivateRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </BrowserRouter>
  );
}

export default App;