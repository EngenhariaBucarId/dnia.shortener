import { useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/AuthLayout";
import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";
import { Button } from "@/components/ui/button";

/**
 * Definir senha — destino dos dois links que chegam por e-mail (convite e
 * "esqueci a senha"). Os dois já abrem uma sessão; aqui só se troca a senha.
 */
export default function SetPassword() {
  const { session, loading } = useAuth();

  useEffect(() => {
    document.title = "Definir senha · links.dn.ia";
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="eyebrow animate-pulse">Carregando…</span>
      </div>
    );
  }

  // Sem sessão: o link expirou, já foi usado ou a pessoa abriu a página direto.
  if (!session) {
    return (
      <AuthLayout
        title="Link inválido ou expirado"
        description="Os links de convite e de recuperação valem uma vez só e por tempo limitado."
      >
        <div className="flex flex-col gap-2">
          <Button asChild>
            <RouterLink to="/esqueci-senha">Pedir um link novo</RouterLink>
          </Button>
          <Button asChild variant="ghost">
            <RouterLink to="/login">Voltar pro login</RouterLink>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Defina sua senha"
      description={
        <>
          Acesso de <span className="font-semibold text-foreground">{session.user.email}</span>.
          Depois disso você entra com e-mail e senha.
        </>
      }
    >
      <UpdatePasswordForm />
    </AuthLayout>
  );
}
