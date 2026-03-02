import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuditTrailProvider } from '@/contexts/audit/AuditTrailContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import CapabilityRoute from '@/components/security/CapabilityRoute';
import ContextGuard from '@/components/ContextGuard';
import AppLayout from '@/components/AppLayout';
import CampaignContextGate from '@/components/CampaignContextGate';
import { AppContextResolver } from '@/contexts/AppContext';
import Dashboard from '@/pages/Dashboard';

import MonitoringPage from '@/pages/MonitoringPage';
import SettlementOpsPage from '@/pages/SettlementOpsPage';
import AuthPage from '@/pages/AuthPage';
import NotFound from './pages/NotFound';
import CampaignsListPage from '@/pages/admin/CampaignsListPage';
import CampaignFormPage from '@/pages/admin/CampaignFormPage';
import OperationStepperPage from '@/pages/OperationStepperPage';
import BuyerPortalPage from '@/pages/BuyerPortalPage';
import InvestorPortalPage from '@/pages/InvestorPortalPage';
import CommoditiesMasterDataPage from '@/pages/admin/CommoditiesMasterDataPage';
import LegacyRouteRedirectPage from '@/pages/LegacyRouteRedirectPage';
import OrdersListPage from '@/pages/admin/OrdersListPage';
import PricingAnalysisPage from '@/pages/PricingAnalysisPage';
import ProductsManagementPage from '@/pages/admin/ProductsManagementPage';
import FreightManagementPage from '@/pages/admin/FreightManagementPage';
import OperationDetailPage from '@/pages/OperationDetailPage';
import GrossToNetReportPage from '@/pages/reports/GrossToNetReportPage';
import CredorOemPortalPage from '@/pages/portals/CredorOemPortalPage';
import BackofficePortalPage from '@/pages/portals/BackofficePortalPage';
import JuridicoPortalPage from '@/pages/portals/JuridicoPortalPage';
import TomadorPortalPage from '@/pages/portals/TomadorPortalPage';
import FornecedorPortalPage from '@/pages/portals/FornecedorPortalPage';
import InvestidorPortalPage from '@/pages/portals/InvestidorPortalPage';
import ComplianceAuditoriaPortalPage from '@/pages/portals/ComplianceAuditoriaPortalPage';
import CampaignSummaryPage from '@/pages/CampaignSummaryPage';
import AdminPlaceholderPage from '@/pages/admin/AdminPlaceholderPage';
import UsersManagementPage from '@/pages/admin/UsersManagementPage';
import { PORTAL_BY_PROFILE } from '@/config/portals';
import type { UserProfile } from '@/types/authorization';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const portalRoutesByProfile: Record<UserProfile, { path: string; capability: (typeof PORTAL_BY_PROFILE)[UserProfile]['requiredCapability']; element: JSX.Element }> = {
  credor_oem: { path: PORTAL_BY_PROFILE.credor_oem.route, capability: PORTAL_BY_PROFILE.credor_oem.requiredCapability, element: <CredorOemPortalPage /> },
  backoffice: { path: PORTAL_BY_PROFILE.backoffice.route, capability: PORTAL_BY_PROFILE.backoffice.requiredCapability, element: <BackofficePortalPage /> },
  juridico: { path: PORTAL_BY_PROFILE.juridico.route, capability: PORTAL_BY_PROFILE.juridico.requiredCapability, element: <JuridicoPortalPage /> },
  tomador: { path: PORTAL_BY_PROFILE.tomador.route, capability: PORTAL_BY_PROFILE.tomador.requiredCapability, element: <TomadorPortalPage /> },
  fornecedor: { path: PORTAL_BY_PROFILE.fornecedor.route, capability: PORTAL_BY_PROFILE.fornecedor.requiredCapability, element: <FornecedorPortalPage /> },
  investidor: { path: PORTAL_BY_PROFILE.investidor.route, capability: PORTAL_BY_PROFILE.investidor.requiredCapability, element: <InvestidorPortalPage /> },
  compliance_auditoria: { path: PORTAL_BY_PROFILE.compliance_auditoria.route, capability: PORTAL_BY_PROFILE.compliance_auditoria.requiredCapability, element: <ComplianceAuditoriaPortalPage /> },
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AuditTrailProvider>
            <AppContextResolver>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    
                    <Route path="/simulacao" element={<LegacyRouteRedirectPage source="simulacao" />} />
                    <Route path="/paridade" element={<LegacyRouteRedirectPage source="paridade" />} />
                    <Route path="/documentos" element={<LegacyRouteRedirectPage source="documentos" />} />
                    <Route path="/monitoramento" element={<CampaignContextGate><MonitoringPage /></CampaignContextGate>} />
                    <Route path="/liquidacao" element={<CampaignContextGate><SettlementOpsPage /></CampaignContextGate>} />
                    <Route path="/operacao/novo" element={<CampaignContextGate><OperationStepperPage /></CampaignContextGate>} />
                    <Route path="/operacao/:id" element={<CampaignContextGate><OperationStepperPage /></CampaignContextGate>} />
                    <Route path="/operacao/:id/analise-precos" element={<CampaignContextGate><PricingAnalysisPage /></CampaignContextGate>} />
                    <Route path="/operacao/:id/detalhe" element={<CampaignContextGate><OperationDetailPage /></CampaignContextGate>} />
                    <Route path="/admin/campanhas" element={<CampaignsListPage />} />
                    <Route path="/admin/campanhas/:id" element={<CampaignFormPage />} />
                    <Route path="/admin/produtos" element={<ProductsManagementPage />} />
                    <Route path="/admin/frete" element={<FreightManagementPage />} />
                    <Route path="/admin/commodities-masterdata" element={<CommoditiesMasterDataPage />} />
                    <Route path="/admin/pedidos" element={<OrdersListPage />} />
                    <Route path="/admin/usuarios" element={<UsersManagementPage />} />
                    <Route path="/admin/capacidades" element={<AdminPlaceholderPage title="Capacidades" />} />
                    <Route path="/admin/integracoes" element={<AdminPlaceholderPage title="Integrações" />} />
                    <Route path="/admin/templates-globais" element={<AdminPlaceholderPage title="Templates Globais" />} />
                    <Route path="/campanhas/resumo" element={<CampaignContextGate><CampaignSummaryPage /></CampaignContextGate>} />
                    <Route path="/campanhas/incentivos" element={<CampaignContextGate><AdminPlaceholderPage title="Incentivos (Combos)" /></CampaignContextGate>} />
                    <Route path="/campanhas/whitelists" element={<CampaignContextGate><AdminPlaceholderPage title="Whitelists" /></CampaignContextGate>} />
                    <Route path="/campanhas/due-dates" element={<CampaignContextGate><AdminPlaceholderPage title="Due Dates" /></CampaignContextGate>} />
                    <Route path="/relatorios/gross-to-net" element={<GrossToNetReportPage />} />
                    <Route path="/compradores" element={<BuyerPortalPage />} />
                    <Route path="/investidores" element={<InvestorPortalPage />} />
                    {Object.values(portalRoutesByProfile).map(({ path, capability, element }) => (
                      <Route
                        key={path}
                        path={path}
                        element={<CapabilityRoute capability={capability}>{element}</CapabilityRoute>}
                      />
                    ))}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            } />
          </Routes>
            </AppContextResolver>
          </AuditTrailProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
