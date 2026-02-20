import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import CampaignPage from "@/pages/CampaignPage";
import SimulationPage from "@/pages/SimulationPage";
import ParityPage from "@/pages/ParityPage";
import DocumentsPage from "@/pages/DocumentsPage";
import MonitoringPage from "@/pages/MonitoringPage";
import AuthPage from "@/pages/AuthPage";
import NotFound from "./pages/NotFound";
import CampaignsListPage from "@/pages/admin/CampaignsListPage";
import CampaignFormPage from "@/pages/admin/CampaignFormPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min - dados ficam em cache entre navegações
      gcTime: 10 * 60 * 1000,   // 10 min - cache mantido mesmo após desmontar
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/campanha" element={<CampaignPage />} />
                    <Route path="/simulacao" element={<SimulationPage />} />
                    <Route path="/paridade" element={<ParityPage />} />
                    <Route path="/documentos" element={<DocumentsPage />} />
                    <Route path="/monitoramento" element={<MonitoringPage />} />
                    <Route path="/admin/campanhas" element={<CampaignsListPage />} />
                    <Route path="/admin/campanhas/:id" element={<CampaignFormPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
