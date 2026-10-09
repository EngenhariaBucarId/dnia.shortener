/**
 * Regras da tela de páginas de bio: separação em ativas × arquivadas (arquivar
 * = is_active false; o Worker só serve página ativa) e as imagens que saem do
 * Storage quando uma página é apagada.
 */
type BioPageLike = {
  is_active: boolean;
  avatar_url: string | null;
  background_url: string | null;
  logo_url: string | null;
};

export function splitBioPages<T extends BioPageLike>(pages: T[]): { active: T[]; archived: T[] } {
  return {
    active: pages.filter((p) => p.is_active),
    archived: pages.filter((p) => !p.is_active),
  };
}

/** Foto, fundo e logo enviados — o que precisa sair do Storage junto com a página. */
export function bioPageImageUrls(page: BioPageLike): string[] {
  return [page.avatar_url, page.background_url, page.logo_url].filter(
    (url): url is string => Boolean(url)
  );
}
