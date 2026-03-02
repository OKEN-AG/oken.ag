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
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/*" element={<ProtectedRoute><AppLayout><Routes>
                <Route path="/" element={<ContextGuard><Dashboard /></ContextGuard>} />
                <Route path="/simulacao" element={<ContextGuard><LegacyRouteRedirectPage source="simulacao" /></ContextGuard>} />
                <Route path="/paridade" element={<ContextGuard><LegacyRouteRedirectPage source="paridade" /></ContextGuard>} />
                <Route path="/documentos" element={<ContextGuard><LegacyRouteRedirectPage source="documentos" /></ContextGuard>} />
                <Route path="/monitoramento" element={<ContextGuard><MonitoringPage /></ContextGuard>} />
                <Route path="/liquidacao" element={<ContextGuard><SettlementOpsPage /></ContextGuard>} />
                <Route path="/operacao/novo" element={<ContextGuard><OperationStepperPage /></ContextGuard>} />
                <Route path="/operacao/:id" element={<ContextGuard><OperationStepperPage /></ContextGuard>} />
                <Route path="/operacao/:id/analise-precos" element={<ContextGuard><PricingAnalysisPage /></ContextGuard>} />
                <Route path="/operacao/:id/detalhe" element={<ContextGuard><OperationDetailPage /></ContextGuard>} />

                <Route path="/campanhas/resumo" element={<ContextGuard><CampaignSummaryPage /></ContextGuard>} />
                <Route path="/campanhas/incentivos" element={<ContextGuard><AdminPlaceholderPage title="Incentivos da Campanha" /></ContextGuard>} />
                <Route path="/campanhas/whitelists" element={<ContextGuard><AdminPlaceholderPage title="Whitelists da Campanha" /></ContextGuard>} />
                <Route path="/campanhas/due-dates" element={<ContextGuard><AdminPlaceholderPage title="Due Dates da Campanha" /></ContextGuard>} />

                <Route path="/admin/usuarios" element={<AdminPlaceholderPage title="Administração de Usuários" />} />
                <Route path="/admin/capacidades" element={<AdminPlaceholderPage title="Capacidades" />} />
                <Route path="/admin/integracoes" element={<AdminPlaceholderPage title="Integrações" />} />
                <Route path="/admin/templates-globais" element={<AdminPlaceholderPage title="Templates Globais" />} />
                <Route path="/admin/campanhas" element={<CampaignsListPage />} />
                <Route path="/admin/campanhas/:id" element={<CampaignFormPage />} />
                <Route path="/admin/produtos" element={<ContextGuard><ProductsManagementPage /></ContextGuard>} />
                <Route path="/admin/frete" element={<ContextGuard><FreightManagementPage /></ContextGuard>} />
                <Route path="/admin/commodities-masterdata" element={<ContextGuard><CommoditiesMasterDataPage /></ContextGuard>} />
                <Route path="/admin/pedidos" element={<ContextGuard><OrdersListPage /></ContextGuard>} />
                <Route path="/relatorios/gross-to-net" element={<ContextGuard><GrossToNetReportPage /></ContextGuard>} />
                <Route path="/compradores" element={<BuyerPortalPage />} />
                <Route path="/investidores" element={<InvestorPortalPage />} />
                {Object.values(portalRoutesByProfile).map(({ path, capability, element }) => (
                  <Route key={path} path={path} element={<CapabilityRoute capability={capability}>{element}</CapabilityRoute>} />
                ))}
                <Route path="*" element={<NotFound />} />
              </Routes></AppLayout></ProtectedRoute>} />
            </Routes>
          </AuditTrailProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
