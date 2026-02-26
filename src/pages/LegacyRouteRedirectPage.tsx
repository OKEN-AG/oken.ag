import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  source: 'simulacao' | 'paridade' | 'documentos';
  target?: string;
  countdownSeconds?: number;
};

const sourceLabel: Record<Props['source'], string> = {
  simulacao: 'Simulação',
  paridade: 'Paridade',
  documentos: 'Documentos',
};

export default function LegacyRouteRedirectPage({ source, target = '/operacao/novo', countdownSeconds = 6 }: Props) {
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate(target, { replace: true, state: { fromLegacyRoute: source } });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [navigate, source, target]);

  const title = useMemo(() => `A rota ${sourceLabel[source]} foi incorporada ao fluxo de Operação`, [source]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Para melhorar a experiência e evitar configurações duplicadas, essa etapa agora é executada dentro da Nova Operação.
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Redirecionando automaticamente em <strong>{secondsLeft}s</strong>.
        </div>
        <Button onClick={() => navigate(target, { replace: true, state: { fromLegacyRoute: source } })} className="gap-2">
          Ir para Nova Operação
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
