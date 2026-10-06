import { useMemo } from "react";
import { bioPageHtml } from "../../cloudflare-worker/redirect.js";
import { SHORT_DOMAIN } from "@/lib/supabase";

/**
 * Preview da página de bio num "celular".
 *
 * Não é uma imitação em React: é o MESMO HTML que o Worker publica
 * (bioPageHtml), no modo preview — então o que aparece aqui é o que vai ao
 * ar. O iframe roda com sandbox vazio (sem script, sem navegação), e no modo
 * preview os botões não têm href: clicar aqui nunca conta clique.
 */
export function BioPreview({
  slug,
  title,
  subtitle,
  avatarUrl,
  background,
  backgroundUrl,
  logoUrl,
  items,
}: {
  slug: string;
  title: string;
  subtitle: string;
  avatarUrl: string;
  background: string;
  backgroundUrl: string;
  logoUrl: string;
  items: { label: string; slug: string }[];
}) {
  const html = useMemo(
    () =>
      bioPageHtml(
        {
          title: title.trim() || slug,
          subtitle: subtitle.trim() || null,
          avatar_url: avatarUrl || null,
          background,
          background_url: backgroundUrl || null,
          logo_url: logoUrl || null,
        },
        items.map((item) => ({ label: item.label, links: { slug: item.slug } })),
        { preview: true }
      ),
    [slug, title, subtitle, avatarUrl, background, backgroundUrl, logoUrl, items]
  );

  return (
    <figure className="mx-auto w-[300px]">
      <div className="rounded-[44px] border border-border bg-card p-2.5 shadow-[var(--shadow-float)]">
        <div className="relative overflow-hidden rounded-[36px] border border-border-subtle">
          {/* barra de endereço, pra ficar claro qual URL a pessoa vê */}
          <div className="flex h-9 items-center justify-center border-b border-border-subtle bg-muted px-4">
            <span className="truncate font-code text-[11px] text-muted-foreground">
              {SHORT_DOMAIN}/@{slug}
            </span>
          </div>
          <iframe
            title={`Preview da página @${slug}`}
            srcDoc={html}
            sandbox=""
            className="block h-[560px] w-full bg-card"
          />
        </div>
      </div>
      <figcaption className="eyebrow mt-4 text-center">
        Preview · atualiza enquanto você edita
      </figcaption>
    </figure>
  );
}
