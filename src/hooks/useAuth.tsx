import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { MemberRole } from "@/lib/types";

/**
 * Sessão + papel no time.
 *
 * Estar logado não basta: o acesso vem da tabela `members` (ver schema.sql).
 * Conta sem linha lá — alguém removido do time, ou uma conta criada por fora
 * — fica com `role: null` e o app mostra a tela de "sem acesso". A trava de
 * verdade é o RLS; isto aqui é só pra UI saber o que mostrar.
 */
type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** null = sem acesso ao time (ou ainda carregando, ver `loading`). */
  role: MemberRole | null;
  isAdmin: boolean;
  loading: boolean;
  /** true quando a sessão veio de um link de recuperação de senha. */
  recovering: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const MIN_PASSWORD_LENGTH = 8;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Pra qual usuário o papel já foi carregado — evita piscar "sem acesso"
  // entre o login e a resposta da tabela members.
  const [roleFor, setRoleFor] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
      setSession(nextSession);
      setSessionLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    let active = true;
    if (!userId) {
      setRole(null);
      return;
    }

    supabase
      .from("members")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }: { data: { role: MemberRole } | null }) => {
        if (!active) return;
        setRole(data?.role ?? null);
        setRoleFor(userId);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    // scope "global" explícito: derruba a sessão em todos os dispositivos, sem
    // depender do padrão do SDK.
    await supabase.auth.signOut({ scope: "global" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      isAdmin: role === "admin",
      loading: sessionLoading || (userId !== null && roleFor !== userId),
      recovering,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        // Mensagem genérica de propósito: não diz se o e-mail existe.
        return { error: error ? "E-mail ou senha incorretos." : null };
      },
      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/definir-senha`,
        });
        return { error: error?.message ?? null };
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (!error) setRecovering(false);
        return { error: error?.message ?? null };
      },
      signOut,
    }),
    [session, role, sessionLoading, userId, roleFor, recovering, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}
