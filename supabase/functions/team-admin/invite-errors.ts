/**
 * Traduz o erro do Supabase Auth no convite em status + mensagem para o admin.
 *
 * Os dois casos que mais aparecem vêm do SMTP padrão do Supabase: ele envia só
 * 2 e-mails por hora e só entrega para membros da organização no Supabase.
 * Sem esta tradução, a tela mostrava "Não foi possível concluir" e ninguém
 * sabia o que fazer.
 *
 * Arquivo sem API do Deno de propósito: roda igual no Node, nos testes.
 */
export type InviteError = { status?: number; code?: string; message?: string };

const CRIAR_PELO_SUPABASE =
  "Crie a pessoa no Supabase (Authentication › Users › Add user, com Auto Confirm) e peça a um admin para incluí-la no time.";

export function inviteErrorResponse(err: InviteError): { status: number; error: string } {
  const message = err.message ?? "";

  if (err.status === 429 || err.code === "over_email_send_rate_limit" || /rate limit/i.test(message)) {
    return {
      status: 429,
      error: `Limite de e-mails do Supabase atingido (2 por hora no e-mail padrão). Tente de novo em 1 hora ou ${CRIAR_PELO_SUPABASE.charAt(0).toLowerCase()}${CRIAR_PELO_SUPABASE.slice(1)}`,
    };
  }

  if (/not authorized/i.test(message)) {
    return {
      status: 422,
      error: `O e-mail padrão do Supabase só entrega para membros da organização no Supabase. ${CRIAR_PELO_SUPABASE}`,
    };
  }

  if (err.code === "email_exists" || /already|registered|exists/i.test(message)) {
    return {
      status: 409,
      error:
        "Esse e-mail já tem conta. Se a pessoa saiu do time, remova a conta antiga antes de convidar de novo.",
    };
  }

  return { status: 500, error: "Não foi possível enviar o convite." };
}
