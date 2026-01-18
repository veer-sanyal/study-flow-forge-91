import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AdminRoute } from "@/components/layout/AdminRoute";
import Auth from "@/pages/Auth";
import Study from "@/pages/Study";
import Progress from "@/pages/Progress";
import Settings from "@/pages/Settings";
import AdminCalendar from "@/pages/AdminCalendar";
import AdminIngestion from "@/pages/AdminIngestion";
import AdminQuestions from "@/pages/AdminQuestions";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
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
                <Route path="/admin/questions" element={<AdminQuestions />} />
              </Route>
            </Route>
          </Route>
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
