import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";

export default function Login() {
  const { session, loading, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Entrar · links.dn.ia";
  }, []);

  if (!loading && session) return <Navigate to="/" replace />;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    const { error: signInError } = await signInWithMagicLink(email.trim());

    if (signInError) {
      // Mensagem genérica de propósito: não confirmamos se o email existe.
      setError(
        "Não foi possível enviar o link. Confira o email ou fale com quem administra o painel."
      );
      setStatus("error");
      return;
    }

    setStatus("sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex flex-col items-center text-center">
          <h1>
            <BrandLogo size="lg" />
          </h1>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Encurtador com UTM e métrica de clique. Acesso restrito ao time.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 sm:pt-8">
            {status === "sent" ? (
              <div className="space-y-3 text-center">
                <p className="font-display text-lg font-semibold">
                  Link enviado
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Abra o email que acabou de chegar em{" "}
                  <span className="text-foreground">{email}</span> e clique no
                  link pra entrar. Ele expira em 1 hora.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStatus("idle")}
                >
                  Usar outro email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email do time</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    placeholder="voce@dnia.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="text-[13px] text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={status === "sending"}
                >
                  {status === "sending" ? "Enviando…" : "Receber link de acesso"}
                </Button>

                <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                  Sem senha: você recebe um link de acesso por email. Só emails
                  já cadastrados no Supabase conseguem entrar.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
