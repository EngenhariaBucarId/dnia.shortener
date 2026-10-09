// Edge Function `team-admin` — convida e remove membros do time.
//
// Por que existe: criar e apagar usuário no Supabase Auth exige a
// service_role, e essa chave nunca vai pro navegador. O painel chama esta
// função com o JWT de quem está logado; ela confere, com a service_role, que
// esse alguém é ADMIN na tabela members antes de fazer qualquer coisa.
//
// Ações (POST, JSON):
//   { "action": "invite", "email": "x@dnia.com.br", "role": "membro" | "admin" }
//   { "action": "remove", "user_id": "<uuid>" }
//
// Secrets (Edge Functions > Secrets, ou `supabase secrets set`):
//   PANEL_URL  URL do painel, sem barra no fim (ex.: https://painel.dnia.ai).
//              É pra onde o link do e-mail de convite leva e a única origem
//              aceita pelo CORS.
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY o próprio
// Supabase injeta em toda Edge Function.

import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = new Set(["admin", "membro"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PANEL_URL = (Deno.env.get("PANEL_URL") ?? "").replace(/\/+$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cors(origin: string | null): Record<string, string> {
  // Só o painel conversa com esta função. Origem desconhecida não recebe o
  // cabeçalho, e o navegador bloqueia a resposta.
  return origin && PANEL_URL && origin === PANEL_URL
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, origin);

  if (!PANEL_URL) {
    console.error("team-admin: secret PANEL_URL não configurado.");
    return json({ error: "Função sem configuração (PANEL_URL)." }, 500, origin);
  }

  // 1) Quem está chamando? O JWT do painel, validado pelo próprio Auth.
  const authHeader = req.headers.get("authorization") ?? "";
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: callerData, error: callerError } = await asCaller.auth.getUser();
  if (callerError || !callerData.user) {
    return json({ error: "Sessão inválida. Entre de novo." }, 401, origin);
  }
  const caller = callerData.user;

  // 2) É admin? Conferido com a service_role, que não depende do RLS.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerMember } = await admin
    .from("members")
    .select("role")
    .eq("user_id", caller.id)
    .maybeSingle();
  if (callerMember?.role !== "admin") {
    return json({ error: "Só admin pode gerenciar o time." }, 403, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }

  // 3a) Convidar
  if (body.action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "membro");
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return json({ error: "E-mail inválido." }, 400, origin);
    }
    if (!ROLES.has(role)) return json({ error: "Papel inválido." }, 400, origin);

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${PANEL_URL}/definir-senha` }
    );
    if (inviteError || !invited.user) {
      const exists = /already|registered|exists/i.test(inviteError?.message ?? "");
      return json(
        {
          error: exists
            ? "Esse e-mail já tem conta. Se a pessoa saiu do time, remova a conta antiga antes de convidar de novo."
            : "Não foi possível enviar o convite.",
        },
        exists ? 409 : 500,
        origin
      );
    }

    const { error: memberError } = await admin.from("members").insert({
      user_id: invited.user.id,
      email,
      role,
      invited_by: caller.id,
    });
    if (memberError) {
      // Sem a linha em members a conta não acessa nada — mas não deixamos
      // conta órfã pra trás.
      await admin.auth.admin.deleteUser(invited.user.id);
      console.error("team-admin: falha ao gravar membro:", memberError.message);
      return json({ error: "Não foi possível registrar o membro." }, 500, origin);
    }

    return json({ ok: true, user_id: invited.user.id }, 200, origin);
  }

  // 3b) Remover
  if (body.action === "remove") {
    const userId = String(body.user_id ?? "");
    if (!UUID_RE.test(userId)) return json({ error: "Membro inválido." }, 400, origin);
    if (userId === caller.id) {
      return json({ error: "Você não pode remover a si mesmo." }, 400, origin);
    }

    // Primeiro a linha de members: o trigger recusa se for o último admin, e
    // aí a conta fica intacta. Só depois apaga a conta no Auth, o que também
    // derruba as sessões abertas dela.
    const { error: deleteMemberError } = await admin
      .from("members")
      .delete()
      .eq("user_id", userId);
    if (deleteMemberError) {
      const lastAdmin = /pelo menos um admin/i.test(deleteMemberError.message);
      return json(
        { error: lastAdmin ? "O time precisa de pelo menos um admin." : "Não foi possível remover." },
        lastAdmin ? 409 : 500,
        origin
      );
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      // A pessoa já perdeu o acesso (sem linha em members); só a conta ficou.
      console.error("team-admin: membro removido, mas a conta não:", deleteUserError.message);
    }
    return json({ ok: true }, 200, origin);
  }

  return json({ error: "Ação desconhecida." }, 400, origin);
});
