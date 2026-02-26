import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import CampaignPage from "@/pages/CampaignPage";
import MonitoringPage from "@/pages/MonitoringPage";
import AuthPage from "@/pages/AuthPage";
import NotFound from "./pages/NotFound";
import CampaignsListPage from "@/pages/admin/CampaignsListPage";
import CampaignFormPage from "@/pages/admin/CampaignFormPage";
import OperationStepperPage from "@/pages/OperationStepperPage";
import BuyerPortalPage from "@/pages/BuyerPortalPage";
import CommoditiesMasterDataPage from "@/pages/admin/CommoditiesMasterDataPage";
import LegacyRouteRedirectPage from "@/pages/LegacyRouteRedirectPage";
import OrdersListPage from "@/pages/admin/OrdersListPage";
import PricingAnalysisPage from "@/pages/PricingAnalysisPage";

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
                    <Route path="/simulacao" element={<LegacyRouteRedirectPage source="simulacao" />} />
                    <Route path="/paridade" element={<LegacyRouteRedirectPage source="paridade" />} />
                    <Route path="/documentos" element={<LegacyRouteRedirectPage source="documentos" />} />
                    <Route path="/monitoramento" element={<MonitoringPage />} />
                    <Route path="/operacao/novo" element={<OperationStepperPage />} />
                    <Route path="/operacao/:id" element={<OperationStepperPage />} />
                    <Route path="/operacao/:id/analise-precos" element={<PricingAnalysisPage />} />
                    <Route path="/admin/campanhas" element={<CampaignsListPage />} />
                    <Route path="/admin/campanhas/:id" element={<CampaignFormPage />} />
                    <Route path="/admin/commodities-masterdata" element={<CommoditiesMasterDataPage />} />
                    <Route path="/admin/pedidos" element={<OrdersListPage />} />
                    <Route path="/compradores" element={<BuyerPortalPage />} />
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
