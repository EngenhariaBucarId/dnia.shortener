// Tradução dos erros de convite do Supabase Auth em mensagem para o admin,
// e leitura dessa mensagem no painel.
import assert from "node:assert/strict";
import { inviteErrorResponse } from "../supabase/functions/team-admin/invite-errors.ts";
import { functionErrorMessage } from "../src/lib/function-error.ts";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\n--- erros de convite ---");

await check("limite de e-mails do Supabase vira 429 com mensagem clara", () => {
  const r = inviteErrorResponse({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" });
  assert.equal(r.status, 429);
  assert.match(r.error, /limite de e-mails/i);
  assert.match(r.error, /Authentication/);
});

await check("e-mail fora da organização (SMTP padrão) explica o motivo", () => {
  const r = inviteErrorResponse({ status: 400, message: "Email address not authorized" });
  assert.equal(r.status, 422);
  assert.match(r.error, /só entrega/i);
});

await check("conta já existente continua 409", () => {
  const r = inviteErrorResponse({ status: 422, code: "email_exists", message: "A user with this email address has already been registered" });
  assert.equal(r.status, 409);
  assert.match(r.error, /já tem conta/);
});

await check("erro desconhecido continua genérico, sem vazar detalhe", () => {
  const r = inviteErrorResponse({ status: 500, message: "boom interno" });
  assert.equal(r.status, 500);
  assert.equal(r.error, "Não foi possível enviar o convite.");
});

console.log("\n--- leitura do erro no painel ---");

await check("usa a mensagem que a função mandou", async () => {
  const ctx = new Response(JSON.stringify({ error: "Mensagem da função" }), { status: 409 });
  assert.equal(await functionErrorMessage({ context: ctx }), "Mensagem da função");
});

await check("sem corpo legível, 429 ainda explica o limite de e-mails", async () => {
  const ctx = new Response("não é json", { status: 429 });
  assert.match(await functionErrorMessage({ context: ctx }), /limite de e-mails/i);
});

await check("falha de rede (sem resposta) diz pra conferir o endereço do painel", async () => {
  assert.match(await functionErrorMessage(new TypeError("Failed to fetch")), /shortner\.dnia\.ai/);
});

console.log(`\n${passed} verificações passaram.\n`);
