import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { safeNextPath } from "@/lib/safe-next-path";
import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";

export default function Login() {
  const { session, loading, recovering } = useAuth();
  const [params] = useSearchParams();

  useEffect(() => {
    document.title = "Entrar · links.dn.ia";
  }, []);

  // Sessão de recuperação de senha: termina de definir a senha antes.
  if (!loading && session && recovering) return <Navigate to="/definir-senha" replace />;
  if (!loading && session) return <Navigate to={safeNextPath(params.get("next"), "/")} replace />;

  return (
    <AuthLayout title="Entrar" description="Use o e-mail e a senha do seu convite.">
      <LoginForm />
    </AuthLayout>
  );
}
