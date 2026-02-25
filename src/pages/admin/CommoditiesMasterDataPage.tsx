import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

type CommodityRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  kg_per_unit: number | null;
  liters_per_unit: number | null;
  active: boolean;
};

const EMPTY_FORM = {
  code: '',
  name: '',
  unit: 'saca',
  kg_per_unit: '',
  liters_per_unit: '',
};

export default function CommoditiesMasterDataPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['commodities-master-data'],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from('commodities_master_data')
        .select('id, code, name, unit, kg_per_unit, liters_per_unit, active')
        .order('name', { ascending: true });
      if (error) throw error;
      return (rows || []) as unknown as CommodityRow[];
    },
  });

  const createCommodity = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        unit: form.unit.trim() || 'saca',
        kg_per_unit: form.kg_per_unit ? Number(form.kg_per_unit) : null,
        liters_per_unit: form.liters_per_unit ? Number(form.liters_per_unit) : null,
      };

      if (!payload.code || !payload.name) {
        throw new Error('Código e nome são obrigatórios');
      }

      const { error } = await (supabase as any).from('commodities_master_data').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Commodity cadastrada com sucesso');
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ['commodities-master-data'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleCommodity = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase as any)
        .from('commodities_master_data')
        .update({ active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commodities-master-data'] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data || [];
    return (data || []).filter(row =>
      row.name.toLowerCase().includes(term) || row.code.toLowerCase().includes(term),
    );
  }, [data, search]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Commodities MasterData</h1>
        <p className="text-sm text-muted-foreground">Cadastro global de commodities para uso em pagamento/barter.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Input placeholder="Código (ex: SOJA)" value={form.code} onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))} />
        <Input placeholder="Nome" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
        <Input placeholder="Unidade (ex: saca)" value={form.unit} onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))} />
        <Input placeholder="KG por unidade" type="number" step="0.01" value={form.kg_per_unit} onChange={e => setForm(prev => ({ ...prev, kg_per_unit: e.target.value }))} />
        <div className="flex gap-2">
          <Input placeholder="L por unidade" type="number" step="0.01" value={form.liters_per_unit} onChange={e => setForm(prev => ({ ...prev, liters_per_unit: e.target.value }))} />
          <Button onClick={() => createCommodity.mutate()} disabled={createCommodity.isPending}>Salvar</Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Input placeholder="Buscar por nome/código" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Código</th>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Unidade</th>
              <th className="text-left p-3">KG/Un</th>
              <th className="text-left p-3">L/Un</th>
              <th className="text-left p-3">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={6}>Carregando...</td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={6}>Nenhum registro encontrado.</td>
              </tr>
            )}
            {filtered.map(row => (
              <tr key={row.id} className="border-t border-border">
                <td className="p-3 font-mono">{row.code}</td>
                <td className="p-3">{row.name}</td>
                <td className="p-3">{row.unit}</td>
                <td className="p-3">{row.kg_per_unit ?? '-'}</td>
                <td className="p-3">{row.liters_per_unit ?? '-'}</td>
                <td className="p-3">
                  <Switch
                    checked={row.active}
                    onCheckedChange={(checked) => toggleCommodity.mutate({ id: row.id, active: checked })}
                    disabled={toggleCommodity.isPending}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
