import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AdminRoute } from "@/components/layout/AdminRoute";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { FocusProvider } from "@/contexts/FocusContext";
import { EnrollmentGuard } from "@/components/layout/EnrollmentGuard";
import { DiagnosticGuard } from "@/components/layout/DiagnosticGuard";
import Auth from "@/pages/Auth";
import Onboarding from "@/pages/Onboarding";
import Diagnostic from "@/pages/Diagnostic";
import Study from "@/pages/Study";
import StudyFocus from "@/pages/StudyFocus";
import StudentCalendar from "@/pages/StudentCalendar";
import Progress from "@/pages/Progress";
import Settings from "@/pages/Settings";
import AdminCalendar from "@/pages/AdminCalendar";
import AdminIngestion from "@/pages/AdminIngestion";
import AdminCoursesList from "@/pages/AdminCoursesList";
import AdminExamsList from "@/pages/AdminExamsList";
import AdminQuestionsEditor from "@/pages/AdminQuestionsEditor";
import AdminQuestionDetail from "@/pages/AdminQuestionDetail";
import AdminSubpartDetail from "@/pages/AdminSubpartDetail";
import AdminQuestionTypes from "@/pages/AdminQuestionTypes";
// AdminMaterials removed - materials are now managed inside AdminExamsList
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SidebarProvider>
        <FocusProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public route */}
              <Route path="/auth" element={<Auth />} />

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                {/* Onboarding is protected (needs auth) but sits outside EnrollmentGuard */}
                <Route path="/onboarding" element={<Onboarding />} />

                {/* Main App Routes require at least one enrollment */}
                <Route element={<EnrollmentGuard />}>
                  {/* Diagnostic page sits outside DiagnosticGuard but inside EnrollmentGuard */}
                  <Route path="/diagnostic" element={<Diagnostic />} />

                  {/* Main app requires diagnostics complete */}
                  <Route element={<DiagnosticGuard />}>
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<Navigate to="/study" replace />} />
                      <Route path="/study" element={<Study />} />
                      <Route path="/study/focus" element={<StudyFocus />} />
                      <Route path="/calendar" element={<StudentCalendar />} />
                      <Route path="/progress" element={<Progress />} />
                      <Route path="/settings" element={<Settings />} />

                      {/* Admin routes */}
                      <Route element={<AdminRoute />}>
                        <Route path="/admin/calendar" element={<AdminCalendar />} />
                        <Route path="/admin/ingestion" element={<AdminIngestion />} />
                        <Route path="/admin/materials" element={<Navigate to="/admin/questions" replace />} />
                        <Route path="/admin/questions" element={<AdminCoursesList />} />
                        <Route path="/admin/question-types" element={<AdminQuestionTypes />} />
                        <Route path="/admin/questions/:courseId" element={<AdminExamsList />} />
                        <Route path="/admin/questions/:courseId/:examName" element={<AdminQuestionsEditor />} />
                        <Route path="/admin/questions/:courseId/:examName/:questionId" element={<AdminQuestionDetail />} />
                        <Route path="/admin/questions/:courseId/:examName/:questionId/subpart/:subpartId" element={<AdminSubpartDetail />} />
                      </Route>
                    </Route>
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </FocusProvider>
      </SidebarProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
