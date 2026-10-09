/**
 * Adaptado do bloco oficial da Supabase UI Library `password-based-auth-react`
 * (update-password-form.tsx, 2026-10-09). Mudanças: cliente único via useAuth,
 * textos em português, confirmação da senha com as regras visíveis, mínimo de
 * MIN_PASSWORD_LENGTH caracteres e navegação do react-router. Serve pro
 * convite (primeiro acesso) e pra recuperação.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { MIN_PASSWORD_LENGTH, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function UpdatePasswordForm() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const matches = password.length > 0 && password === confirm;

  async function handleUpdatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!longEnough) return setError(`A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (!matches) return setError("As duas senhas não são iguais.");

    setIsLoading(true);
    setError(null);
    const { error: updateError } = await updatePassword(password);
    setIsLoading(false);
    if (updateError) return setError("Não foi possível salvar a senha. Peça um link novo e tente de novo.");
    navigate("/", { replace: true });
  }

  return (
    <form onSubmit={handleUpdatePassword} className="space-y-4">
      <div>
        <Label htmlFor="new-password">Nova senha</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="confirm-password">Repita a senha</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      <ul className="space-y-1 text-[12px]">
        {[
          { ok: longEnough, label: `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres` },
          { ok: matches, label: "As duas senhas iguais" },
        ].map((rule) => (
          <li
            key={rule.label}
            className={cn("flex items-center gap-1.5", rule.ok ? "text-success" : "text-muted-foreground")}
          >
            {rule.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {rule.label}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Salvando…" : "Salvar senha e entrar"}
      </Button>
    </form>
  );
}
