import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    document.title = "Esqueci a senha · links.dn.ia";
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    await sendPasswordReset(email.trim());
    // Mesma resposta pra e-mail existente ou não: a tela não confirma quem
    // tem conta. (Limite de envio é do próprio Supabase Auth.)
    setStatus("sent");
  }

  const back = (
    <RouterLink
      to="/login"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-ink hover:underline"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Voltar pro login
    </RouterLink>
  );

  if (status === "sent") {
    return (
      <AuthLayout title="Confira seu e-mail">
        <div className="flex gap-3 rounded-md border border-border-subtle bg-muted p-4">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p className="text-[13px] leading-relaxed">
            Se <span className="font-semibold">{email}</span> tiver acesso ao painel, você
            vai receber um link pra criar uma senha nova. O link vale por 1 hora.
          </p>
        </div>
        {back}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Esqueci a senha"
      description="Informe o e-mail do seu acesso. Enviamos um link pra você criar uma senha nova."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="voce@dnia.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={status === "sending"}>
          {status === "sending" ? "Enviando…" : "Enviar link"}
        </Button>
      </form>
      {back}
    </AuthLayout>
  );
}
