import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Campaigns from "@/pages/Campaigns";
import BioPages from "@/pages/BioPages";

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="eyebrow animate-pulse">Carregando…</span>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
