import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Loader } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { handleDatabaseError } from '@/lib/error-handler';
import logoLight from '@/assets/logo-light.png';

export default function AuthPage() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const isRecoveryMode = searchParams.get('mode') === 'recovery';
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { signIn, signUp, requestPasswordReset, updatePassword } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user && !isRecoveryMode) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const sanitizeAuthError = (error: any): string => {
      const msg = error?.message || '';
      if (msg.includes('already registered')) return 'Este email já está cadastrado.';
      if (msg.includes('Invalid login')) return 'Email ou senha incorretos.';
      if (msg.includes('Email not confirmed')) return 'Confirme seu email antes de entrar.';
      if (msg.includes('Password should be')) return 'A senha deve ter pelo menos 6 caracteres.';
      return 'Erro ao processar. Tente novamente.';
    };

    if (isSignUp) {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        toast({ title: 'Erro no cadastro', description: sanitizeAuthError(error), variant: 'destructive' });
      } else {
        toast({ title: 'Cadastro realizado!', description: 'Verifique seu email para confirmar a conta.' });
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: 'Erro no login', description: sanitizeAuthError(error), variant: 'destructive' });
      }
    }

    setSubmitting(false);
  };

  const handleRequestReset = async () => {
    if (!email) {
      toast({ title: 'Informe um email', description: 'Digite um email válido para receber o link de recuperação.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const { error } = await requestPasswordReset(email);
    if (error) {
      toast({ title: 'Falha ao enviar recuperação', description: handleDatabaseError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Email enviado', description: 'Se a conta existir, você receberá um link para redefinir sua senha.' });
      setShowForgotPassword(false);
    }
    setSubmitting(false);
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await updatePassword(resetPassword);
    if (error) {
      toast({ title: 'Erro ao redefinir senha', description: handleDatabaseError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Senha atualizada', description: 'Sua senha foi redefinida com sucesso. Faça login para continuar.' });
      window.location.href = '/auth';
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img src={logoLight} alt="BarterPro" className="h-24 w-auto mx-auto mb-2 mix-blend-multiply" />
        </div>

        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {isRecoveryMode ? 'Redefinir senha' : isSignUp ? 'Criar Conta' : 'Entrar'}
          </h2>

          {isRecoveryMode ? (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div>
                <label className="stat-label">Nova senha</label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    className="pl-10 bg-muted border-border text-foreground"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? <Loader className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar nova senha
              </Button>
            </form>
          ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="stat-label">Nome Completo</label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="pl-10 bg-muted border-border text-foreground"
                    placeholder="Seu nome"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="stat-label">Email</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-10 bg-muted border-border text-foreground"
                  placeholder="seu@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="stat-label">Senha</label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 bg-muted border-border text-foreground"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? <Loader className="w-4 h-4 animate-spin mr-2" /> : null}
              {isSignUp ? 'Criar Conta' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-4 text-center space-y-2">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isSignUp ? 'Já tem conta? Entrar' : 'Não tem conta? Cadastre-se'}
            </button>

            {!isSignUp && (
              <div>
                {!showForgotPassword ? (
                  <button
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-primary hover:underline"
                    type="button"
                  >
                    Esqueci minha senha
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Vamos enviar um link de recuperação para o email informado.</p>
                    <Button type="button" onClick={handleRequestReset} disabled={submitting} variant="outline" className="w-full">
                      Enviar link de recuperação
                    </Button>
                  </div>
                )}
              </div>
            )}
            </div>
          </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
