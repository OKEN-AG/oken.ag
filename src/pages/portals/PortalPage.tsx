import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditTrail } from '@/contexts/audit/AuditTrailContext';
import { PortalDefinition } from '@/config/portals';
import { Button } from '@/components/ui/button';

interface PortalPageProps {
  portal: PortalDefinition;
}

export default function PortalPage({ portal }: PortalPageProps) {
  const { user, hasCapability } = useAuth();
  const { entries, logCriticalAction } = useAuditTrail();

  const visibleQueues = useMemo(
    () => portal.queues.filter(queue => hasCapability(queue.capability)),
    [hasCapability, portal.queues],
  );

  const handleCriticalAction = (queueLabel: string) => {
    logCriticalAction({
      action: `Aprovação crítica de ${queueLabel}`,
      portal: portal.title,
      actor: user?.email ?? 'sistema',
      details: `Ação executada na rota ${portal.route}`,
    });
  };

  const portalEntries = entries.filter(entry => entry.portal === portal.title).slice(0, 6);

  return (
    <div className="p-6 space-y-6">
      <section className="glass-card p-6">
        <h1 className="text-2xl font-semibold">{portal.title}</h1>
        <p className="text-muted-foreground mt-2">{portal.description}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Filas operacionais</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleQueues.map(queue => (
            <article key={queue.key} className="glass-card p-4 space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">{queue.label}</h3>
                <span className="text-xs text-muted-foreground">SLA {queue.slaHours}h</span>
              </div>
              <p className="text-2xl font-semibold">{queue.pending}</p>
              <p className="text-xs text-muted-foreground">Pendências em processamento</p>
              <Button size="sm" className="mt-2" onClick={() => handleCriticalAction(queue.label)}>
                Registrar ação crítica
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card p-4">
        <h2 className="text-lg font-semibold mb-3">Trilha de auditoria (ações críticas)</h2>
        <ul className="space-y-2 text-sm">
          {portalEntries.length === 0 && <li className="text-muted-foreground">Nenhuma ação crítica registrada.</li>}
          {portalEntries.map(entry => (
            <li key={entry.id} className="border border-border rounded-md p-3">
              <p className="font-medium">{entry.action}</p>
              <p className="text-muted-foreground">{entry.actor} • {new Date(entry.timestamp).toLocaleString('pt-BR')}</p>
              <p className="text-muted-foreground">{entry.details}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
