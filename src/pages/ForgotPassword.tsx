import { useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPassword() {
  useEffect(() => {
    document.title = "Esqueci a senha · links.dn.ia";
  }, []);

  return (
    <AuthLayout
      title="Esqueci a senha"
      description="Informe o e-mail do seu acesso. Enviamos um link pra você criar uma senha nova."
    >
      <ForgotPasswordForm />
      <RouterLink
        to="/login"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-ink hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar pro login
      </RouterLink>
    </AuthLayout>
  );
}
