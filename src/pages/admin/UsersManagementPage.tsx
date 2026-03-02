import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { APP_ROLE_LABELS, APP_ROLES, APP_ROLE_TO_USER_PROFILE, AppRole, USER_PROFILE_LABELS } from '@/config/accessProfiles';
import { useAuth } from '@/contexts/AuthContext';

type UserRow = {
  id: string;
  full_name: string;
  company: string | null;
  user_id: string;
  role: AppRole | null;
};

const fetchUsers = async (): Promise<UserRow[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, company, user_id, user_roles(role)')
    .order('full_name', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((profile: any) => ({
    id: profile.id,
    full_name: profile.full_name,
    company: profile.company,
    user_id: profile.user_id,
    role: profile.user_roles?.[0]?.role ?? null,
  }));
};

export default function UsersManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { requestPasswordReset } = useAuth();
  const [resetEmailByUser, setResetEmailByUser] = useState<Record<string, string>>({});

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users-management'],
    queryFn: fetchUsers,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, nextRole }: { userId: string; nextRole: AppRole }) => {
      const { error: deleteError } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase.from('user_roles').insert({ user_id: userId, role: nextRole });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast({ title: 'Perfil atualizado', description: 'O perfil de acesso do usuário foi atualizado com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['users-management'] });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar perfil', description: error.message ?? 'Não foi possível atualizar o perfil.', variant: 'destructive' });
    },
  });

  const roleSummary = useMemo(() => {
    return users.reduce((acc, user) => {
      const key = user.role ?? 'client';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [users]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gestão de usuários e perfis</CardTitle>
          <CardDescription>
            Defina perfil de acesso por usuário no Backoffice e dispare recuperação de senha por email.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-5 gap-3">
          {APP_ROLES.map(role => (
            <div key={role} className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{APP_ROLE_LABELS[role]}</p>
              <p className="text-xl font-semibold">{roleSummary[role] ?? 0}</p>
              <p className="text-xs text-muted-foreground">Portal: {USER_PROFILE_LABELS[APP_ROLE_TO_USER_PROFILE[role]]}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuários cadastrados</CardTitle>
          <CardDescription>
            Observação: o envio de recuperação depende do email digitado para cada usuário.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando usuários...</p>
          ) : (
            <div className="space-y-4">
              {users.map(user => (
                <div key={user.id} className="border rounded-md p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{user.full_name || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground">ID: {user.user_id}</p>
                      {user.company ? <p className="text-xs text-muted-foreground">Empresa: {user.company}</p> : null}
                    </div>
                    <Badge variant="secondary">{APP_ROLE_LABELS[(user.role ?? 'client') as AppRole]}</Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Perfil de acesso</p>
                      <Select
                        defaultValue={(user.role ?? 'client') as AppRole}
                        onValueChange={(value: AppRole) => updateRoleMutation.mutate({ userId: user.user_id, nextRole: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APP_ROLES.map(role => (
                            <SelectItem key={role} value={role}>{APP_ROLE_LABELS[role]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <p className="text-xs text-muted-foreground">Resgate de acesso / recuperação de senha</p>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="email do usuário"
                          value={resetEmailByUser[user.user_id] ?? ''}
                          onChange={e => setResetEmailByUser(prev => ({ ...prev, [user.user_id]: e.target.value }))}
                        />
                        <Button
                          variant="outline"
                          onClick={async () => {
                            const email = resetEmailByUser[user.user_id];
                            if (!email) {
                              toast({ title: 'Email obrigatório', description: 'Informe o email para disparar recuperação.', variant: 'destructive' });
                              return;
                            }

                            const { error } = await requestPasswordReset(email);
                            if (error) {
                              toast({ title: 'Falha ao enviar link', description: error.message, variant: 'destructive' });
                              return;
                            }
                            toast({ title: 'Recuperação enviada', description: `Link de recuperação enviado para ${email}.` });
                          }}
                        >
                          Enviar recuperação
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
