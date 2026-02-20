import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Settings, ShoppingCart, BarChart3,
  Wheat, FileText, ChevronLeft, ChevronRight, LogOut,
  FolderCog } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveCampaigns, useCampaignData } from '@/hooks/useActiveCampaign';
import { useSidebarCollapsed } from '@/contexts/SidebarContext';
import type { JourneyModule } from '@/types/barter';
import logoDark from '@/assets/logo-dark.png';

const navItems: { to: string; icon: any; label: string; module?: JourneyModule }[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/campanha', icon: Settings, label: 'Campanha' },
  { to: '/simulacao', icon: ShoppingCart, label: 'Simulação', module: 'simulacao' },
  { to: '/paridade', icon: Wheat, label: 'Paridade Barter', module: 'barter' },
  { to: '/documentos', icon: FileText, label: 'Documentos', module: 'documentos' },
  { to: '/monitoramento', icon: BarChart3, label: 'Monitoramento' },
];

const adminItems = [
  { to: '/admin/campanhas', icon: FolderCog, label: 'Campanhas' },
];

export default function AppSidebar() {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const { data: activeCampaigns } = useActiveCampaigns();
  const firstCampaignId = activeCampaigns?.[0]?.id;
  const { campaign } = useCampaignData(firstCampaignId);
  const activeModules = campaign?.activeModules || [];

  const visibleNavItems = navItems.filter(item => {
    if (!item.module) return true;
    if (activeModules.length === 0) return true;
    return activeModules.includes(item.module);
  });

  const renderNavItem = (item: typeof navItems[0]) => {
    const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
    return (
      <NavLink
        key={item.to}
        to={item.to}
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

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2 }}
      className="h-screen bg-sidebar border-r border-sidebar-border flex flex-col fixed left-0 top-0 z-40"
    >
      <div className="h-16 flex items-center px-3 border-b border-sidebar-border overflow-hidden">
        {!collapsed ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center">
            <img src={logoDark} alt="BarterPro" className="h-10 w-auto object-contain" />
          </motion.div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <Wheat className="w-5 h-5 text-primary-foreground" />
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {visibleNavItems.map(renderNavItem)}
        {!collapsed && (
          <div className="pt-4 pb-1 px-3">
            <span className="text-[10px] uppercase tracking-widest text-primary">Administração</span>
          </div>
        )}
        {collapsed && <div className="border-t border-sidebar-border my-2" />}
        {adminItems.map(renderNavItem)}
      </nav>

      <div className="border-t border-sidebar-border p-2 space-y-1">
        {!collapsed && user && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground truncate">{user.email}</div>
        )}
        <button onClick={signOut} className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full">
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center justify-center w-full py-1.5 text-sidebar-foreground hover:text-foreground transition-colors">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  );
}
