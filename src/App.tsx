import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LogOut, ShieldOff } from "lucide-react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import SetPassword from "@/pages/SetPassword";
import Dashboard from "@/pages/Dashboard";
import Campaigns from "@/pages/Campaigns";
import BioPages from "@/pages/BioPages";
import Team from "@/pages/Team";

function FullScreenLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="eyebrow animate-pulse">Carregando…</span>
    </div>
  );
}

/** Conta logada que não está (ou não está mais) no time. */
function NoAccess() {
  const { user, signOut } = useAuth();
  return (
    <AuthLayout
      title="Sem acesso ao painel"
      description={
        <>
          A conta <span className="font-semibold text-foreground">{user?.email}</span> não faz
          parte do time. Se você deveria ter acesso, peça um convite a um admin.
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-muted p-4">
        <ShieldOff className="h-5 w-5 shrink-0 text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">
          O acesso é só por convite e pode ter sido removido.
        </p>
      </div>
      <Button variant="outline" className="w-full" onClick={signOut}>
        <LogOut />
        Sair
      </Button>
    </AuthLayout>
  );
}

/**
 * Guarda de rota. É só UX: quem decide o acesso de verdade é o RLS, que exige
 * linha em `members` (schema.sql). Aqui só escolhemos qual tela mostrar.
 */
function Protected({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { session, role, isAdmin, loading, recovering } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoading />;
  if (!session) {
    // Volta pra página pedida depois do login (validada pelo safeNextPath).
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (recovering) return <Navigate to="/definir-senha" replace />;
  if (!role) return <NoAccess />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/esqueci-senha" element={<ForgotPassword />} />
          <Route path="/definir-senha" element={<SetPassword />} />
          <Route
            path="/"
            element={
              <Protected>
                <Dashboard />
              </Protected>
            }
          />
          <Route
            path="/campanhas"
            element={
              <Protected>
                <Campaigns />
              </Protected>
            }
          />
          <Route
            path="/bio"
            element={
              <Protected>
                <BioPages />
              </Protected>
            }
          />
          <Route
            path="/time"
            element={
              <Protected adminOnly>
                <Team />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
