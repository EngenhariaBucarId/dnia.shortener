import { useCallback, useEffect, useState } from "react";
import { MailPlus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { MemberRole, MemberRow } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { functionErrorMessage } from "@/lib/function-error";

const ROLE_LABEL: Record<MemberRole, string> = { admin: "Admin", membro: "Membro" };

/**
 * Time — só admin. Convidar e remover passam pela Edge Function `team-admin`
 * (precisa da service_role pra mexer no Auth); trocar papel é update direto,
 * barrado pelo RLS pra quem não é admin. O banco também impede ficar sem admin.
 */
export default function Team() {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("membro");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("members")
      .select("*")
      .order("created_at", { ascending: true });
    if (loadError) {
      setError(loadError.message);
      setMembers([]);
      return;
    }
    setMembers(data ?? []);
  }, []);

  useEffect(() => {
    document.title = "Time · links.dn.ia";
    load();
  }, [load]);

  const adminCount = (members ?? []).filter((m) => m.role === "admin").length;

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setInviting(true);
    setInviteMsg(null);
    const target = email.trim().toLowerCase();
    const { error: invokeError } = await supabase.functions.invoke("team-admin", {
      body: { action: "invite", email: target, role },
    });
    setInviting(false);
    if (invokeError) {
      setInviteMsg({ ok: false, text: await functionErrorMessage(invokeError) });
      return;
    }
    setInviteMsg({
      ok: true,
      text: `Convite enviado pra ${target}. A pessoa recebe um e-mail pra criar a senha.`,
    });
    setEmail("");
    setRole("membro");
    load();
  }

  async function changeRole(member: MemberRow, next: MemberRole) {
    setError(null);
    const { error: updateError } = await supabase
      .from("members")
      .update({ role: next })
      .eq("user_id", member.user_id);
    if (updateError) {
      setError(
        /pelo menos um admin/i.test(updateError.message)
          ? "O time precisa de pelo menos um admin."
          : updateError.message
      );
    }
    load();
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    const { error: invokeError } = await supabase.functions.invoke("team-admin", {
      body: { action: "remove", user_id: removing.user_id },
    });
    setRemoveBusy(false);
    if (invokeError) {
      setError(await functionErrorMessage(invokeError));
    }
    setRemoving(null);
    load();
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
          Time
        </h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-muted-foreground">
          Quem tem acesso ao painel. A entrada é só por convite: a pessoa recebe um
          e-mail, cria a senha e entra. Remover alguém corta o acesso na hora.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Convidar pessoa</CardTitle>
          <CardDescription>
            Admin convida, remove e muda papéis. Membro usa o painel normalmente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={invite} className="grid gap-4 sm:grid-cols-[1fr_180px_auto]">
            <div>
              <Label htmlFor="invite-email">E-mail</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="pessoa@dnia.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="membro">Membro</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={inviting} className="w-full sm:w-auto">
                <MailPlus />
                {inviting ? "Enviando…" : "Enviar convite"}
              </Button>
            </div>
          </form>
          {inviteMsg && (
            <p
              role="status"
              className={`mt-4 text-[13px] ${inviteMsg.ok ? "text-success" : "text-destructive"}`}
            >
              {inviteMsg.text}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="font-display text-xl font-bold tracking-[-0.02em]">
          Pessoas com acesso
          {members && (
            <span className="ml-2 text-[15px] font-medium text-muted-foreground tabular">
              {members.length}
            </span>
          )}
        </h2>

        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}

        {members === null ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => {
              const isMe = member.user_id === user?.id;
              const lastAdmin = member.role === "admin" && adminCount <= 1;
              return (
                <div
                  key={member.user_id}
                  className="panel flex flex-wrap items-center gap-x-4 gap-y-3 p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    {member.role === "admin" ? (
                      <ShieldCheck className="h-5 w-5 text-primary-ink" />
                    ) : (
                      <UserRound className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                      <span className="truncate">{member.email}</span>
                      {isMe && <Badge variant="primary">você</Badge>}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      no time desde {formatDate(member.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(v) => changeRole(member, v as MemberRole)}
                      disabled={lastAdmin}
                    >
                      <SelectTrigger
                        className="h-9 w-[120px]"
                        aria-label={`Papel de ${member.email}`}
                        title={lastAdmin ? "Último admin: promova outra pessoa antes" : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="membro">{ROLE_LABEL.membro}</SelectItem>
                        <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isMe || lastAdmin}
                      title={isMe ? "Você não pode remover a si mesmo" : "Remover do time"}
                      aria-label={`Remover ${member.email} do time`}
                      onClick={() => setRemoving(member)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover do time?</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">{removing?.email}</span> perde o
              acesso na hora e a conta é apagada. Os links e páginas que essa pessoa criou
              continuam no painel. Pra voltar, é preciso um convite novo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={confirmRemove} disabled={removeBusy}>
              {removeBusy ? "Removendo…" : "Remover"}
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
