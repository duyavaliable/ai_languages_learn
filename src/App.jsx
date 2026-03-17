import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import RegisterTeacherPage from './pages/RegisterTeacher';
import RegisterAdminPage from './pages/RegisterAdmin';
import HomePage from './pages/HomePage';
import AdminAccountManager from './pages/AdminAccountManager';
import AdminContentManager from './pages/AdminContentManager';
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;