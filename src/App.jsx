import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom"
import HomePage from "@/pages/HomePage"
import PrivateRoute from "./components/PrivateRoute.jsx"
import LoginPage from "./pages/Login.jsx"
import RegisterPage from "./pages/Register.jsx"
import RegisterAdminPage from "./pages/RegisterAdmin.jsx"
import RegisterTeacherPage from "./pages/RegisterTeacher.jsx"
import CourseSkillsPage from "./pages/CourseSkillsPage.jsx"
import SkillExercisesPage from "./pages/SkillExercisesPage.jsx"
import ExerciseAttemptPage from "./pages/ExerciseAttemptPage.jsx"
import AdminAccountManager from "./pages/AdminAccountManager.jsx"
import AdminContentManager from "./pages/AdminContentManager.jsx"
import TeacherCreateContent from "./pages/TeacherCreateContent.jsx"
import UnauthorizedPage from "./pages/Unauthorized.jsx"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register-admin" element={<RegisterAdminPage />} />
        <Route path="/register-teacher" element={<RegisterTeacherPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

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
          path="/courses/:courseId/skills/:skill/exercises/:exerciseId"
          element={
            <PrivateRoute>
              <ExerciseAttemptPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/admin/users"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <AdminAccountManager />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/content"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <AdminContentManager />
            </PrivateRoute>
          }
        />
        <Route
          path="/teacher/create-content"
          element={
            <PrivateRoute allowedRoles={["teacher"]}>
              <TeacherCreateContent />
            </PrivateRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
