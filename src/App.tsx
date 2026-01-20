import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AdminRoute } from "@/components/layout/AdminRoute";
import { SidebarProvider } from "@/hooks/use-sidebar";
import Auth from "@/pages/Auth";
import Study from "@/pages/Study";
import Progress from "@/pages/Progress";
import Settings from "@/pages/Settings";
import AdminCalendar from "@/pages/AdminCalendar";
import AdminIngestion from "@/pages/AdminIngestion";
import AdminCoursesList from "@/pages/AdminCoursesList";
import AdminExamsList from "@/pages/AdminExamsList";
import AdminQuestionsEditor from "@/pages/AdminQuestionsEditor";
import AdminQuestionDetail from "@/pages/AdminQuestionDetail";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SidebarProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public route */}
            <Route path="/auth" element={<Auth />} />
            
            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/study" replace />} />
                <Route path="/study" element={<Study />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/settings" element={<Settings />} />
                
                {/* Admin routes */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin/calendar" element={<AdminCalendar />} />
                  <Route path="/admin/ingestion" element={<AdminIngestion />} />
                  <Route path="/admin/questions" element={<AdminCoursesList />} />
                  <Route path="/admin/questions/:courseId" element={<AdminExamsList />} />
                  <Route path="/admin/questions/:courseId/:examName" element={<AdminQuestionsEditor />} />
                  <Route path="/admin/questions/:courseId/:examName/:questionId" element={<AdminQuestionDetail />} />
                </Route>
              </Route>
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SidebarProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
