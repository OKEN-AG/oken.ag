import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useNavigationContext } from '@/hooks/useNavigationContext';

export default function ContextGuard({ children }: { children: ReactNode }) {
  const { hasFullContext, withContext } = useNavigationContext();

  if (!hasFullContext) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Selecione tenant e campanha</h1>
        <p className="text-muted-foreground mt-2">Este módulo exige contexto completo para evitar deep links fora do escopo.</p>
        <Link className="text-primary underline mt-3 inline-block" to={withContext('/campanhas/resumo')}>
          Ir para Resumo da Campanha
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
