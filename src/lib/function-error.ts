/**
 * Mensagem legível para um erro de supabase.functions.invoke.
 *
 * Erro HTTP da função vem com a Response em `context`: usamos o `error` do
 * corpo JSON. Se o corpo não der pra ler, o status ainda diz algo útil. Sem
 * `context` foi falha de rede ou CORS — o caso típico é usar o painel por um
 * endereço que não é o oficial.
 */
export async function functionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response })?.context;

  if (context && typeof context.json === "function") {
    try {
      const body = await context.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* corpo não é JSON */
    }
    if (context.status === 429) {
      return "Limite de e-mails do Supabase atingido. Tente de novo em 1 hora ou crie a pessoa direto no Supabase.";
    }
    return "Não foi possível concluir. Tente de novo.";
  }

  return "Não foi possível falar com o servidor. Confira se você está em https://shortner.dnia.ai e tente de novo.";
}
