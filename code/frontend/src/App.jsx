import { Routes, Route } from "react-router-dom";
import { PublicLayout } from "./components/layouts/PublicLayout.jsx";
import { AuthenticatedLayout } from "./components/layouts/AuthenticatedLayout.jsx";
import { ProtectedRoute } from "./components/auth/ProtectedRoute.jsx";
import { RoleGate } from "./components/auth/RoleGate.jsx";
import { SmoothScroll } from "./components/layouts/SmoothScroll.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { SignupPage } from "./pages/SignupPage.jsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.jsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.jsx";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage.jsx";
import { TermsOfServicePage } from "./pages/TermsOfServicePage.jsx";
import { CourseCatalogPage } from "./pages/CourseCatalogPage.jsx";
import { CourseDetailPage } from "./pages/CourseDetailPage.jsx";
import { LessonPlayerPage } from "./pages/LessonPlayerPage.jsx";
import { PracticeSetPage } from "./pages/PracticeSetPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { JoinCohortPage } from "./pages/JoinCohortPage.jsx";
import { CohortsPage } from "./pages/CohortsPage.jsx";
import { CohortDetailPage } from "./pages/CohortDetailPage.jsx";
import { AdminUsersPage } from "./pages/AdminUsersPage.jsx";
import { AdminCohortsPage } from "./pages/AdminCohortsPage.jsx";
import { ContentCoursesPage } from "./pages/ContentCoursesPage.jsx";
import { ContentCourseDetailPage } from "./pages/ContentCourseDetailPage.jsx";
import { ContentChapterDetailPage } from "./pages/ContentChapterDetailPage.jsx";
import { ContentLessonDetailPage } from "./pages/ContentLessonDetailPage.jsx";
import { ContentScreenEditorPage } from "./pages/ContentScreenEditorPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";

// Placeholder routes for every core screen (Frontend Milestone 0) -- real content, auth gating,
// and data fetching land in later milestones. Route shape here is the thing being proven, not
// the pages themselves.
export function App() {
  return (
    <>
      <SmoothScroll />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
        </Route>
        {/* Phase 5.5: /courses and /courses/:courseId are deliberately OUTSIDE ProtectedRoute --
            course browsing (syllabus, chapter/lesson titles) is public, so a visitor can preview
            a course before signing up. AuthenticatedLayout's nav itself branches on auth state to
            match. Only the routes that need an actual session (lesson content, practice sets, the
            dashboard) stay behind ProtectedRoute, nested inside the same shell. */}
        <Route element={<AuthenticatedLayout />}>
          <Route path="/courses" element={<CourseCatalogPage />} />
          <Route path="/courses/:courseId" element={<CourseDetailPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
            <Route path="/practice-sets/:practiceSetId" element={<PracticeSetPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/join/:joinCode" element={<JoinCohortPage />} />
            {/* Phase 8A: role check moved out of the page itself into a shared RoleGate, now
                that there's more than one role-restricted destination to justify it. */}
            <Route element={<RoleGate allow={["admin"]} />}>
              <Route path="/admin/users" element={<AdminUsersPage />} />
              {/* Phase 8C: platform-wide cohort visibility, previously unreachable for admin at
                  all (no route, no repository query to even build it from). */}
              <Route path="/admin/cohorts" element={<AdminCohortsPage />} />
            </Route>
            {/* Phase 8B: real cohort management, previously just a panel bolted onto the
                dashboard. Instructor-only, matching GET /cohorts's own backend restriction. */}
            <Route element={<RoleGate allow={["instructor"]} />}>
              <Route path="/cohorts" element={<CohortsPage />} />
              <Route path="/cohorts/:cohortId" element={<CohortDetailPage />} />
            </Route>
            {/* Phase 9 (Milestone 1): content-authoring UI -- the backend API has always allowed
                both roles to author content (an instructor owns their own courses; admin bypasses
                ownership everywhere), so this is the one authoring surface open to both. */}
            <Route element={<RoleGate allow={["instructor", "admin"]} />}>
              <Route path="/admin/content" element={<ContentCoursesPage />} />
              <Route path="/admin/content/courses/:courseId" element={<ContentCourseDetailPage />} />
              <Route path="/admin/content/chapters/:chapterId" element={<ContentChapterDetailPage />} />
              <Route path="/admin/content/lessons/:lessonId" element={<ContentLessonDetailPage />} />
              <Route
                path="/admin/content/lessons/:lessonId/screens/:screenId"
                element={<ContentScreenEditorPage />}
              />
            </Route>
          </Route>
        </Route>
        {/* Nav-flow audit: no catch-all existed at all -- an unmatched URL rendered blank. Outside
            both layouts since it applies regardless of auth state. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
