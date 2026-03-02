import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, FileText, CreditCard, CheckCircle2, Clock, Upload } from 'lucide-react';

export default function FornecedorPortalPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portal do Fornecedor</h1>
        <p className="text-sm text-muted-foreground">Prova de uso, NF, dados bancários e status de pagamento</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Requisições de Pagamento</p>
              <p className="text-xl font-bold">0</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-xs text-muted-foreground">NFs Pendentes</p>
              <p className="text-xl font-bold">0</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-xs text-muted-foreground">Pagamentos Confirmados</p>
              <p className="text-xl font-bold">0</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-cyan-400" />
            <div>
              <p className="text-xs text-muted-foreground">Whitelist</p>
              <p className="text-sm font-medium text-muted-foreground">Pendente validação</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="requisicoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="requisicoes">Requisições UoP</TabsTrigger>
          <TabsTrigger value="nf">NFs / Comprovantes</TabsTrigger>
          <TabsTrigger value="conta">Conta Bancária</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="requisicoes">
          <Card className="bg-card border-border p-8 text-center">
            <Package className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Requisições de pagamento direto a fornecedor (crédito direcionado / UoP)</p>
            <p className="text-xs text-muted-foreground mt-1">Whitelist de CNPJ, categorias permitidas, budget lines, aprovações</p>
            <Badge variant="outline" className="mt-3">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="nf">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Envio de NF e Comprovantes</CardTitle></CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Upload de NF, pedido de compra e comprovantes de entrega</p>
                <Badge variant="outline" className="mt-2">NEXT</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conta">
          <Card className="bg-card border-border p-8 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Confirmação de conta bancária e validação na whitelist</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card className="bg-card border-border p-8 text-center">
            <Clock className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Status de aprovação, conciliação e histórico de pagamentos</p>
            <Badge variant="outline" className="mt-2">NEXT</Badge>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
