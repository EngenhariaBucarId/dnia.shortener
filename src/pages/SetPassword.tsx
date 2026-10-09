import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { MIN_PASSWORD_LENGTH, useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Definir senha — serve pros dois links que chegam por e-mail:
 *   - convite (primeiro acesso): a pessoa cria a senha dela;
 *   - recuperação ("esqueci a senha"): cria uma senha nova.
 * Nos dois casos o link já abre uma sessão; aqui só se troca a senha dela.
 */
export default function SetPassword() {
  const { session, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Definir senha · links.dn.ia";
  }, []);

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const matches = password.length > 0 && password === confirm;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!longEnough) return setError(`A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (!matches) return setError("As duas senhas não são iguais.");

    setSaving(true);
    setError(null);
    const { error: updateError } = await updatePassword(password);
    setSaving(false);
    if (updateError) return setError("Não foi possível salvar a senha. Peça um link novo e tente de novo.");
    navigate("/", { replace: true });
  }

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
      <form onSubmit={handleSubmit} className="space-y-4">
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

        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Salvando…" : "Salvar senha e entrar"}
        </Button>
      </form>
    </AuthLayout>
  );
}
