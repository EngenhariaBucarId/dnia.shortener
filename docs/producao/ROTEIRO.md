# Roteiro de produção — links.dn.ia

Passos que só o dono das contas faz. Cada um diz onde clicar e como conferir.
Nenhum valor secreto vai neste arquivo (o repositório é público).

Projeto Supabase: `zqtcfqskdfscqtbzeglu` · Painel: `https://shortner.dnia.ai` ·
Links: `https://s.dnia.ai`

## A. Supabase Auth (antes de qualquer login)

Dashboard › **Authentication**:

1. **Sign In / Providers**
   - *Allow new users to sign up*: **desligado**.
   - *Allow anonymous sign-ins*: **desligado**.
   - Provedor **Email**: ligado; *Confirm email*: ligado.
   - *Minimum password length*: **8**. *Prevent use of leaked passwords*: ligado, se o plano permitir.
2. **URL Configuration**
   - *Site URL*: `https://shortner.dnia.ai`
   - *Redirect URLs*: `https://shortner.dnia.ai/definir-senha` e `http://localhost:8080/definir-senha`
3. **Emails › Templates**
   - **Invite user** — Assunto: `Seu acesso ao links.dn.ia`. Corpo:

     ```html
     <h2>Você foi convidado pro links.dn.ia</h2>
     <p>O encurtador de links e métricas de campanha da dn.ia.</p>
     <p><a href="{{ .ConfirmationURL }}">Criar minha senha e entrar</a></p>
     <p>O link vale uma vez só. Se ele expirar, peça um convite novo a um admin.</p>
     ```

   - **Reset password** — Assunto: `Criar uma senha nova no links.dn.ia`. Corpo:

     ```html
     <h2>Senha nova pro links.dn.ia</h2>
     <p>Alguém pediu pra trocar a senha desta conta. Se foi você:</p>
     <p><a href="{{ .ConfirmationURL }}">Criar uma senha nova</a></p>
     <p>O link vale por 1 hora. Se não foi você, ignore este e-mail.</p>
     ```

> O SMTP padrão do Supabase envia poucos e-mails por hora — dá pro time no começo.

## B. Seu usuário (primeiro admin)

1. **Authentication › Users › Add user › Create new user**: seu e-mail e uma senha forte, *Auto Confirm User* marcado.
2. Avise o Claude. Ele roda, logo em seguida, o comando que te torna admin
   (é o mesmo do README, em `### 1. Supabase`, passo 4).

## C. Chave secreta do Worker

Dashboard › **Project Settings › API Keys › Secret keys › New secret key**, nome
`cloudflare-worker`. Copie o valor (`sb_secret_…`) só para o passo E — não cole
em chat, arquivo ou commit.

## D. DNS na Cloudflare

1. Adicione a zona `dnia.ai` à conta Cloudflare (se ainda não estiver) e troque
   os nameservers no registrador do domínio, como a Cloudflare indicar.
2. **DNS › Records › Add record**: `CNAME`, nome `shortner`, alvo = o que a
   Vercel mostrar em *Settings › Domains* do projeto, **Proxy status: DNS only**
   (nuvem cinza).
3. Confira: na Vercel, `shortner.dnia.ai` aparece como *Valid Configuration*.

## E. Worker em s.dnia.ai

Num terminal, na pasta `cloudflare-worker/` do repositório:

```bash
npx wrangler login
npx wrangler secret put SUPABASE_URL          # https://zqtcfqskdfscqtbzeglu.supabase.co
npx wrangler secret put SUPABASE_SECRET_KEY   # o sb_secret_… do passo C
npx wrangler secret put IP_HASH_SALT          # cole o valor gerado abaixo
npx wrangler secret put FALLBACK_URL          # https://dnia.ai
npx wrangler deploy
```

Para gerar o `IP_HASH_SALT` (32 caracteres aleatórios), no PowerShell:

```powershell
-join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

Confira: `curl -I https://s.dnia.ai/teste` → `HTTP/2 302`, `location: https://dnia.ai/`,
`cache-control: no-store`.

## F. Rate limiting

Cloudflare › zona `dnia.ai` › **Security › WAF › Rate limiting rules › Create rule**:

- Nome: `links s.dnia.ai`
- Quando: *Hostname* igual a `s.dnia.ai`
- Limite: **60 requisições por 1 minuto**, por IP
- Ação: *Block* por 1 minuto

## Voltar atrás

- Painel: Vercel › Deployments › deploy anterior › **Instant Rollback**.
- Worker: `npx wrangler rollback` na pasta `cloudflare-worker/`.
- Sem admin: rode o comando de admin do README pelo SQL Editor.
