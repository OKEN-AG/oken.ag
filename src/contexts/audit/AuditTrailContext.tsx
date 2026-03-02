import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  portal: string;
  actor: string;
  details: string;
}

interface AuditTrailContextType {
  entries: AuditEntry[];
  logCriticalAction: (input: Omit<AuditEntry, 'id' | 'timestamp'>) => void;
}

const AuditTrailContext = createContext<AuditTrailContextType | undefined>(undefined);

export function AuditTrailProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  const logCriticalAction = (input: Omit<AuditEntry, 'id' | 'timestamp'>) => {
    const entry: AuditEntry = {
      ...input,
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };

    setEntries(prev => [entry, ...prev].slice(0, 100));
  };

  const value = useMemo(() => ({ entries, logCriticalAction }), [entries]);

  return <AuditTrailContext.Provider value={value}>{children}</AuditTrailContext.Provider>;
}

export function useAuditTrail() {
  const context = useContext(AuditTrailContext);
  if (!context) throw new Error('useAuditTrail must be used within AuditTrailProvider');
  return context;
}
