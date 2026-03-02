import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, FileText, TrendingUp, Shield, BarChart3, Receipt, BookOpen, MessageSquare } from 'lucide-react';

export default function InvestidorPortalPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portal do Investidor</h1>
        <p className="text-sm text-muted-foreground">Onboarding, ofertas, ordens, extrato, fiscal e suporte</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Saldo Investido</p>
              <p className="text-xl font-bold">R$ 0</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-xs text-muted-foreground">Distribuições Recebidas</p>
              <p className="text-xl font-bold">R$ 0</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-xs text-muted-foreground">Ofertas Disponíveis</p>
              <p className="text-xl font-bold">0</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="w-5 h-5 text-cyan-400" />
            <div>
              <p className="text-xs text-muted-foreground">Suitability</p>
              <p className="text-sm font-medium text-muted-foreground">Não preenchido</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="onboarding" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="ofertas">Ofertas</TabsTrigger>
          <TabsTrigger value="ordens">Ordens</TabsTrigger>
          <TabsTrigger value="extrato">Extrato</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger value="suporte">Suporte</TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Jornada do Investidor</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { step: 'Cadastro + KYC/KYB', status: 'next' },
                  { step: 'Suitability', status: 'next' },
                  { step: 'Aceite de Termos', status: 'next' },
                  { step: 'Depósito', status: 'next' },
                  { step: 'Alocação', status: 'next' },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3 border border-border rounded-md p-3">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{i + 1}</div>
                    <p className="text-sm flex-1">{s.step}</p>
                    <Badge variant="outline" className="text-xs">NEXT</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ofertas">
          <Card className="bg-card border-border p-8 text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Ofertas disponíveis, documentos, janela de captação e limites</p>
            <p className="text-xs text-muted-foreground mt-1">RCVM 88 / RCVM 21/175 / RCVM 60 conforme wrapper ativo</p>
            <Badge variant="outline" className="mt-3">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="ordens">
          <Card className="bg-card border-border p-8 text-center">
            <BarChart3 className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Ordens, alocação, status (success/fail/cancel) e position ledger</p>
            <Badge variant="outline" className="mt-3">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="extrato">
          <Card className="bg-card border-border p-8 text-center">
            <Receipt className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Extrato, distribuições, eventos e histórico de movimentações</p>
            <Badge variant="outline" className="mt-3">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="fiscal">
          <Card className="bg-card border-border p-8 text-center">
            <FileText className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Informes de rendimento, documentos fiscais e retenções</p>
            <Badge variant="outline" className="mt-3">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="suporte">
          <Card className="bg-card border-border p-8 text-center">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Central de mensagens e suporte ao investidor</p>
            <Badge variant="outline" className="mt-3">NEXT</Badge>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
