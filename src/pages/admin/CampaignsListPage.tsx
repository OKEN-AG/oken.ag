import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCampaigns, useUpdateCampaign } from '@/hooks/useCampaigns';
import { toast } from 'sonner';

export default function CampaignsListPage() {
  const navigate = useNavigate();
  const { data: campaigns, isLoading } = useCampaigns();
  const toggleMutation = useUpdateCampaign();

  const handleToggle = (id: string, currentActive: boolean) => {
    toggleMutation.mutate(
      { id, active: !currentActive },
      { onSuccess: () => toast.success(`Campanha ${!currentActive ? 'ativada' : 'desativada'}`) }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Gerencie campanhas comerciais</p>
        </div>
        <Button onClick={() => navigate('/admin/campanhas/nova')}>
          <Plus className="w-4 h-4 mr-2" /> Nova Campanha
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}

      <div className="grid gap-4">
        {campaigns?.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-foreground">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.code_auto && <span className="font-mono mr-1">{c.code_auto}</span>}
                  {c.code_custom && <span className="mr-1">[{c.code_custom}]</span>}
                  Safra {c.season} · {c.target} · {c.price_list_format}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={c.active ? 'default' : 'secondary'} className={c.active ? 'bg-success/10 text-success border-success/20' : ''}>
                {c.active ? '● Ativa' : '○ Inativa'}
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => handleToggle(c.id, c.active)}>
                {c.active ? <ToggleRight className="w-5 h-5 text-success" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/admin/campanhas/${c.id}`)}>
                Editar
              </Button>
            </div>
          </motion.div>
        ))}

        {campaigns?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nenhuma campanha cadastrada. Clique em "Nova Campanha" para começar.
          </div>
        )}
      </div>
    </div>
  );
}
