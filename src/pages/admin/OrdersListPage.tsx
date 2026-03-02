import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function OrdersListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const { data = [], isLoading } = useQuery({
    queryKey: ['admin-orders-list', status],
    queryFn: async () => {
      let query = supabase
        .from('operations')
        .select('id, client_name, client_document, status, created_at, gross_revenue, net_revenue, campaign_id, campaigns(name, currency)')
        .order('created_at', { ascending: false });

      if (status !== 'all') query = query.eq('status', status as any);

      const { data: rows, error } = await query;
      if (error) throw error;
      return rows || [];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data;
    return data.filter((row: any) => {
      const campaignName = String((row as any).campaigns?.name || '').toLowerCase();
      return (
        String(row.client_name || '').toLowerCase().includes(term) ||
        String(row.client_document || '').toLowerCase().includes(term) ||
        String(row.id || '').toLowerCase().includes(term) ||
        campaignName.includes(term)
      );
    });
  }, [data, search]);

  const formatCurrency = (value: number, currency: string = 'BRL') =>
    Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: currency === 'USD' ? 'USD' : 'BRL' });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pedidos / Operações</h1>
        <p className="text-sm text-muted-foreground">Base consultável para administração e monitoramento.</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente, documento, campanha ou ID"
          className="max-w-md"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="simulacao">Simulação</SelectItem>
            <SelectItem value="pedido">Pedido</SelectItem>
            <SelectItem value="formalizado">Formalizado</SelectItem>
            <SelectItem value="garantido">Garantido</SelectItem>
            <SelectItem value="faturado">Faturado</SelectItem>
            <SelectItem value="monitorando">Monitorando</SelectItem>
            <SelectItem value="liquidado">Liquidado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">ID</th>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Campanha</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Bruto</th>
              <th className="text-left p-3">Líquido</th>
              <th className="text-left p-3">Criado em</th>
              <th className="text-left p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="p-3 text-muted-foreground" colSpan={8}>Carregando...</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td className="p-3 text-muted-foreground" colSpan={8}>Nenhuma operação encontrada.</td></tr>
            )}
            {filtered.map((row: any) => {
               // Montantes de operação são sempre em BRL (motor converte USD→BRL)
               const currency = 'BRL';
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{row.id}</td>
                  <td className="p-3">{row.client_name || '—'}</td>
                  <td className="p-3">{row.campaigns?.name || '—'}</td>
                  <td className="p-3 capitalize">{row.status}</td>
                  <td className="p-3 font-mono">{formatCurrency(row.gross_revenue || 0, currency)}</td>
                  <td className="p-3 font-mono">{formatCurrency(row.net_revenue || 0, currency)}</td>
                  <td className="p-3">{new Date(row.created_at).toLocaleString('pt-BR')}</td>
                  <td className="p-3 flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/operacao/${row.id}`)}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/operacao/${row.id}/detalhe`)}>Detalhe</Button>
                    </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
