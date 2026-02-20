import { createContext, useContext } from 'react';

interface SidebarCtx { collapsed: boolean; setCollapsed: (v: boolean) => void; }
const SidebarContext = createContext<SidebarCtx>({ collapsed: false, setCollapsed: () => {} });
export const SidebarProvider = SidebarContext.Provider;
export const useSidebarCollapsed = () => useContext(SidebarContext);
