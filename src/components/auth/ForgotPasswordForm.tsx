/**
 * Adaptado do bloco oficial da Supabase UI Library `password-based-auth-react`
 * (forgot-password-form.tsx, 2026-10-09). Mudanças: cliente único via useAuth
 * (o redirectTo para /definir-senha fica no useAuth), textos em português e
 * mesma resposta exista ou não a conta — a tela não confirma quem tem acesso.
 */
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    await sendPasswordReset(email.trim());
    // Sucesso ou não, a mesma tela. (Limite de envio é do Supabase Auth.)
    setIsLoading(false);
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="flex gap-3 rounded-md border border-border-subtle bg-muted p-4">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <p className="text-[13px] leading-relaxed">
          Se <span className="font-semibold">{email}</span> tiver acesso ao painel, você vai
          receber um link pra criar uma senha nova. O link vale por 1 hora.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleForgotPassword} className="space-y-4">
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
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Enviando…" : "Enviar link"}
      </Button>
    </form>
  );
}
