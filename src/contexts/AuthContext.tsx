import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Capability, UserProfile } from '@/types/authorization';
import { PROFILE_CAPABILITIES } from '@/config/portals';
import { APP_ROLE_TO_USER_PROFILE, AppRole } from '@/config/accessProfiles';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile;
  capabilities: Capability[];
  hasCapability: (capability: Capability) => boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_PROFILE: UserProfile = 'backoffice';

const isValidProfile = (value: unknown): value is UserProfile => (
  typeof value === 'string' && value in PROFILE_CAPABILITIES
);

const getProfileFromSession = (session: Session | null): UserProfile => {
  const token = session?.access_token;
  if (!token) return DEFAULT_PROFILE;

  const [, payload] = token.split('.');
  if (!payload) return DEFAULT_PROFILE;

  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (isValidProfile(decoded?.profile)) return decoded.profile;
  } catch {
    return DEFAULT_PROFILE;
  }

  return DEFAULT_PROFILE;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [appRole, setAppRole] = useState<AppRole | null>(null);
  const profile = appRole ? APP_ROLE_TO_USER_PROFILE[appRole] : getProfileFromSession(session);
  const capabilities = PROFILE_CAPABILITIES[profile] ?? [];

  const loadCurrentRole = async (userId?: string) => {
    if (!userId) {
      setAppRole(null);
      return;
    }

    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    setAppRole((data?.role as AppRole | undefined) ?? null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      void loadCurrentRole(session?.user?.id);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      void loadCurrentRole(session?.user?.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=recovery`,
    });
    return { error: error as Error | null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error as Error | null };
  };

  const hasCapability = (capability: Capability) => capabilities.includes(capability);

  return (
    <AuthContext.Provider value={{ user, session, profile, capabilities, hasCapability, loading, signUp, signIn, signOut, requestPasswordReset, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
