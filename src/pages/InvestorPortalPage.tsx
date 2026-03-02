import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, ClipboardCheck, WalletCards, FileText, Landmark, PieChart } from 'lucide-react';

const modules = [
  {
    title: 'Onboarding e KYC/KYB',
    description: 'Fluxo de cadastro com validação documental, AML e trilha de aceite regulatório.',
    icon: ShieldCheck,
  },
  {
    title: 'Ordens e Alocação',
    description: 'Book de ordens do investidor com regras de suitability e enquadramento por oferta.',
    icon: ClipboardCheck,
  },
  {
    title: 'Extrato e Distribuições',
    description: 'Posição consolidada de cotas/títulos, distribuições e reconciliação financeira.',
    icon: WalletCards,
  },
  {
    title: 'Documentos Fiscais',
    description: 'Central de informes, comprovantes de rendimento e eventos tributáveis.',
    icon: FileText,
  },
];

const wrappers = [
  { name: 'Platform 88', key: 'platform_88', scope: 'Intermediação e operação de plataforma regulada' },
  { name: 'Gestão/Fundos', key: 'fund_management', scope: 'Regras de suitability e governança para fundos' },
  { name: 'Securitização', key: 'securitization', scope: 'Ofertas de recebíveis e emissão estruturada' },
];

export default function InvestorPortalPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Portal do Investidor</h1>
        <p className="text-sm text-muted-foreground">
          Onboarding, ordens, alocação, extrato, distribuições e documentos fiscais em um módulo regulatório dedicado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Landmark className="w-5 h-5" /> Wrappers regulatórios</CardTitle>
          <CardDescription>Isolamento de regras por regime operacional e compliance por evento.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {wrappers.map((wrapper) => (
            <Badge key={wrapper.key} variant="secondary" className="text-xs">
              {wrapper.name}: {wrapper.scope}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <Card key={module.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <module.icon className="w-4 h-4" />
                {module.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{module.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PieChart className="w-5 h-5" /> Lifecycle de oferta/investimento</CardTitle>
          <CardDescription>
            API e eventos especializados para todo ciclo: onboarding, submissão de ordem, alocação, liquidação e distribuição.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
