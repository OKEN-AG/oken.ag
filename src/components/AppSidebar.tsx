import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, ShoppingCart, BarChart3,
  ChevronLeft, ChevronRight, LogOut,
  Users, ShieldCheck, PlugZap, FileCog,
  Package, Truck, DollarSign, Gift, ListChecks, CalendarClock,
  Workflow, FileCheck2, Activity, Landmark,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaignData } from '@/hooks/useActiveCampaign';
import { useAppContext } from '@/contexts/AppContext';
import { useSidebarCollapsed } from '@/contexts/SidebarContext';
import { useNavigationContext } from '@/hooks/useNavigationContext';
import logoDark from '@/assets/logo-dark.png';
import logoIcon from '@/assets/logo-icon.png';

const adminItems = [
  { to: '/admin/usuarios', icon: Users, label: 'Usuários' },
  { to: '/admin/capacidades', icon: ShieldCheck, label: 'Capacidades' },
  { to: '/admin/integracoes', icon: PlugZap, label: 'Integrações' },
  { to: '/admin/templates-globais', icon: FileCog, label: 'Templates Globais' },
];

const campaignItems = [
  { to: '/campanhas/resumo', icon: LayoutDashboard, label: 'Resumo da Campanha' },
  { to: '/admin/produtos', icon: Package, label: 'Produtos' },
  { to: '/admin/commodities-masterdata', icon: DollarSign, label: 'Pricing Commodity' },
  { to: '/admin/frete', icon: Truck, label: 'Frete' },
  { to: '/campanhas/incentivos', icon: Gift, label: 'Incentivos' },
  { to: '/campanhas/whitelists', icon: ListChecks, label: 'Whitelists' },
  { to: '/campanhas/due-dates', icon: CalendarClock, label: 'Due dates' },
];

const runtimeItems = [
  { to: '/operacao/novo', icon: Workflow, label: 'Esteira' },
  { to: '/monitoramento', icon: Activity, label: 'Monitoramento' },
  { to: '/liquidacao', icon: Landmark, label: 'Liquidação' },
  { to: '/admin/pedidos', icon: FileCheck2, label: 'Formalização' },
  { to: '/', icon: ShoppingCart, label: 'Dashboard' },
  { to: '/relatorios/gross-to-net', icon: BarChart3, label: 'Gross-to-Net' },
];

export default function AppSidebar() {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const { campaignId } = useAppContext();
  const { campaign } = useCampaignData(campaignId);
  const activeModules = campaign?.activeModules || [];

  const renderNavItem = (item: { to: string; icon: any; label: string }) => {
    const target = item.to;
    const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
    return (
      <NavLink
        key={item.to}
        to={target}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground glow-border'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        }`}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    );
  };

  const renderSection = (title: string, items: typeof adminItems) => (
    <>
      {!collapsed && (
        <div className="pt-4 pb-1 px-3">
          <span className="text-[10px] uppercase tracking-widest text-primary">{title}</span>
        </div>
      )}
      {collapsed && <div className="border-t border-sidebar-border my-2" />}
      {items.map(renderNavItem)}
    </>
  );

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 260 }}
      transition={{ duration: 0.2 }}
      className="h-screen bg-sidebar border-r border-sidebar-border flex flex-col fixed left-0 top-0 z-40"
    >
      <div className="h-16 flex items-center px-3 border-b border-sidebar-border overflow-hidden">
        {!collapsed ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center">
            <img src={logoDark} alt="BarterPro" className="h-[60px] w-auto object-contain mix-blend-lighten" />
          </motion.div>
        ) : (
          <img src={logoIcon} alt="BarterPro" className="w-10 h-10 object-contain mx-auto" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {renderSection('Administração', adminItems)}
        {renderSection('Campanhas', campaignItems)}
        {renderSection('Operação', runtimeItems)}

        <div className="border-t border-sidebar-border mt-4 pt-2 space-y-1">
          {!collapsed && user && <div className="px-3 py-1.5 text-xs text-muted-foreground truncate">{user.email}</div>}
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full">
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
          <button onClick={() => setCollapsed(!collapsed)} className="flex items-center justify-center w-full py-1.5 text-sidebar-foreground hover:text-foreground transition-colors">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
