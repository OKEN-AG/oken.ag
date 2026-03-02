import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getNextJourneyState, investorJourneySteps } from '@/domains/core/investors/journey';
import type { RegulatoryWrapper } from '@/domains/core/investors/types';
import { useAdvanceInvestorJourney, useCreateInvestor, useCreateInvestorOrder, useInvestorEvidence, useInvestorOrders, useInvestors } from '@/hooks/useInvestorPortal';

export default function InvestorPortalPage() {
  const { toast } = useToast();
  const { data: investors = [] } = useInvestors();
  const [selectedInvestorId, setSelectedInvestorId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [wrapper, setWrapper] = useState<RegulatoryWrapper>('platform_88');
  const [orderAmount, setOrderAmount] = useState(10000);

  const createInvestor = useCreateInvestor();
  const createOrder = useCreateInvestorOrder();
  const advanceJourney = useAdvanceInvestorJourney();

  const selectedInvestor = useMemo(
    () => investors.find((investor) => investor.id === selectedInvestorId) ?? investors[0],
    [investors, selectedInvestorId],
  );

  const { data: orders = [] } = useInvestorOrders(selectedInvestor?.id);
  const { data: evidences = [] } = useInvestorEvidence(selectedInvestor?.id);

  const handleCreateInvestor = async () => {
    try {
      const investor = await createInvestor.mutateAsync({
        full_name: name,
        document_number: document,
        email,
        wrapper_type: wrapper,
      });
      setSelectedInvestorId(investor.id);
      setName('');
      setDocument('');
      setEmail('');
      toast({ title: 'Investidor criado', description: 'Cadastro do novo portal concluído.' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedInvestor) return;
    try {
      await createOrder.mutateAsync({
        investor_id: selectedInvestor.id,
        gross_amount: orderAmount,
        net_amount: orderAmount * 0.98,
      });
      await advanceJourney.mutateAsync({
        investorId: selectedInvestor.id,
        eventType: 'order.created',
        toState: 'order_submitted',
        eventPayload: { grossAmount: orderAmount },
      });
      toast({ title: 'Ordem registrada', description: 'Ordem e evidência regulatória geradas.' });
    } catch (error: any) {
      toast({ title: 'Erro ao criar ordem', description: error.message, variant: 'destructive' });
    }
  };

  const handleAdvanceJourney = async () => {
    if (!selectedInvestor) return;
    try {
      const nextState = getNextJourneyState(selectedInvestor.journey_state);
      await advanceJourney.mutateAsync({
        investorId: selectedInvestor.id,
        investorOrderId: orders[0]?.id,
        eventType: `investor.${nextState}`,
        toState: nextState,
        eventPayload: {
          suitability: ['suitability_pending', 'suitability_approved'].includes(nextState),
          termsAccepted: nextState === 'terms_accepted',
        },
      });
      toast({ title: 'Jornada atualizada', description: `Novo estado: ${nextState}` });
    } catch (error: any) {
      toast({ title: 'Erro ao avançar jornada', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portal do Investidor</h1>
        <p className="text-sm text-muted-foreground">Jornada segregada do cockpit operacional com isolamento por wrapper regulatório.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Novo investidor</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Documento</Label><Input value={document} onChange={(e) => setDocument(e.target.value)} /></div>
            <div><Label>E-mail</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div>
              <Label>Wrapper regulatório</Label>
              <select value={wrapper} onChange={(e) => setWrapper(e.target.value as RegulatoryWrapper)} className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm">
                <option value="platform_88">Platform 88</option>
                <option value="asset_management_funds">Gestão/Fundos</option>
                <option value="securitization">Securitização</option>
              </select>
            </div>
            <Button onClick={handleCreateInvestor} className="w-full">Cadastrar</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Investidores ({investors.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {investors.map((investor) => (
              <button key={investor.id} onClick={() => setSelectedInvestorId(investor.id)} className="w-full text-left border rounded-md p-2 hover:bg-muted">
                <p className="font-medium">{investor.full_name}</p>
                <p className="text-xs text-muted-foreground">{investor.document_number} · {investor.wrapper_type}</p>
                <p className="text-xs">Estado: {investor.journey_state}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Próximas ações</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Valor da ordem (R$)</Label><Input type="number" value={orderAmount} onChange={(e) => setOrderAmount(Number(e.target.value))} /></div>
            <Button onClick={handleCreateOrder} className="w-full" disabled={!selectedInvestor}>Criar ordem</Button>
            <Button onClick={handleAdvanceJourney} variant="outline" className="w-full" disabled={!selectedInvestor}>Avançar jornada</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Jornada completa (Suitability → Termos → Ordem → Alocação → Extrato → Distribuição)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
            {investorJourneySteps.map((step) => (
              <div key={step.state} className={`rounded-md border p-2 text-xs ${selectedInvestor?.journey_state === step.state ? 'border-primary bg-primary/10' : ''}`}>
                {step.label}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ordens do investidor</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="rounded-md border p-2 text-sm">
                <p>Bruto: R$ {order.gross_amount.toLocaleString('pt-BR')}</p>
                <p>Líquido: R$ {order.net_amount.toLocaleString('pt-BR')}</p>
                <p>Alocado: R$ {order.allocated_amount.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-muted-foreground">Estado: {order.journey_state}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Trilhas de evidência regulatória</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-auto">
            {evidences.map((evidence) => (
              <div key={evidence.id} className="rounded-md border p-2 text-xs">
                <p className="font-medium">{evidence.event_type}</p>
                <p>{evidence.from_state ?? 'n/a'} → {evidence.to_state}</p>
                <p>Wrapper: {evidence.wrapper_type}</p>
                <p className="text-muted-foreground">{new Date(evidence.happened_at).toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
