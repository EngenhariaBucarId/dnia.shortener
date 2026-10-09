import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { supabase, SHORT_DOMAIN } from "@/lib/supabase";
import type { BioItemStatsRow, BioPageItemRow, BioPageRow } from "@/lib/types";
import {
  ROSTOS,
  buildFinalUrl,
  randomSlug,
  slugTag,
  suggestUtms,
  validateDestinationUrl,
} from "@/lib/utm";
import {
  IMAGE_ACCEPT,
  type BioImageKind,
  removeBioImages,
  uploadBioImage,
  validateImageFile,
} from "@/lib/image";
import { BIO_BACKGROUNDS, type BioBackgroundKey } from "../../cloudflare-worker/redirect.js";
import { BioPreview } from "@/components/BioPreview";
import { bioPageImageUrls } from "@/lib/bio-pages";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ItemWithStats = BioPageItemRow & { clicks: number; slug: string };

const BACKGROUND_KEYS = Object.keys(BIO_BACKGROUNDS) as BioBackgroundKey[];

/** "background:#fff;" → "#fff", pra amostra do seletor usar o mesmo fundo da página. */
function swatchBackground(key: BioBackgroundKey): string {
  return BIO_BACKGROUNDS[key].css.replace(/^background:/, "").replace(/;$/, "");
}

/** Botão de arquivo: um <label> com cara de botão envolvendo o input escondido. */
function UploadButton({
  label,
  busy,
  onFile,
}: {
  label: string;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "cursor-pointer focus-within:ring-2 focus-within:ring-ring/30",
        busy && "pointer-events-none opacity-60"
      )}
    >
      {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
      {busy ? "Enviando…" : label}
      <input
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Limpa o valor pra poder escolher o mesmo arquivo de novo.
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

export function BioPageEditor({
  page,
  onChanged,
  onDeleted,
}: {
  page: BioPageRow;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [archiving, setArchiving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [items, setItems] = useState<ItemWithStats[] | null>(null);
  const [title, setTitle] = useState(page.title);
  const [subtitle, setSubtitle] = useState(page.subtitle ?? "");
  const [avatarUrl, setAvatarUrl] = useState(page.avatar_url ?? "");
  const [background, setBackground] = useState<string>(page.background ?? "premium");
  const [backgroundUrl, setBackgroundUrl] = useState(page.background_url ?? "");
  const [logoUrl, setLogoUrl] = useState(page.logo_url ?? "");
  const [uploading, setUploading] = useState<BioImageKind | null>(null);
  const [savingPage, setSavingPage] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = `https://${SHORT_DOMAIN}/@${page.slug}`;

  const dirty =
    title !== page.title ||
    subtitle !== (page.subtitle ?? "") ||
    avatarUrl !== (page.avatar_url ?? "") ||
    background !== (page.background ?? "premium") ||
    backgroundUrl !== (page.background_url ?? "") ||
    logoUrl !== (page.logo_url ?? "");

  const loadItems = useCallback(async () => {
    const [itemsRes, statsRes] = await Promise.all([
      supabase
        .from("bio_page_items")
        .select("*")
        .eq("page_id", page.id)
        .order("position", { ascending: true }),
      supabase.from("v_bio_item_stats").select("*").eq("page_id", page.id),
    ]);

    const statsByItem = new Map(
      (statsRes.data ?? []).map((row: BioItemStatsRow) => [row.item_id, row])
    );

    setItems(
      (itemsRes.data ?? []).map((item: BioPageItemRow) => ({
        ...item,
        clicks: statsByItem.get(item.id)?.clicks ?? 0,
        slug: statsByItem.get(item.id)?.slug ?? "",
      }))
    );
  }, [page.id]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const previewItems = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item.is_active && item.slug)
        .map((item) => ({ label: item.label, slug: item.slug })),
    [items]
  );

  /**
   * Imagem enviada e ainda não salva que foi trocada de novo vira lixo no
   * Storage — apaga na hora. A que está salva só sai depois do "Salvar",
   * porque a página no ar ainda aponta pra ela.
   */
  function discardIfUnsaved(url: string, saved: string | null) {
    if (url && url !== (saved ?? "")) removeBioImages([url]);
  }

  async function handleUpload(kind: BioImageKind, file: File) {
    setPageError(null);
    const invalid = validateImageFile(file);
    if (invalid) return setPageError(invalid);

    setUploading(kind);
    try {
      const url = await uploadBioImage(page.id, kind, file);
      if (kind === "avatar") {
        discardIfUnsaved(avatarUrl, page.avatar_url);
        setAvatarUrl(url);
      } else if (kind === "logo") {
        discardIfUnsaved(logoUrl, page.logo_url);
        setLogoUrl(url);
      } else {
        discardIfUnsaved(backgroundUrl, page.background_url);
        setBackgroundUrl(url);
        setBackground("imagem");
      }
    } catch (err) {
      setPageError(
        `Não foi possível enviar a imagem. ${err instanceof Error ? err.message : ""}`.trim()
      );
    } finally {
      setUploading(null);
    }
  }

  function removeAvatar() {
    discardIfUnsaved(avatarUrl, page.avatar_url);
    setAvatarUrl("");
  }

  function removeLogo() {
    discardIfUnsaved(logoUrl, page.logo_url);
    setLogoUrl("");
  }

  function removeBackgroundImage() {
    discardIfUnsaved(backgroundUrl, page.background_url);
    setBackgroundUrl("");
    if (background === "imagem") setBackground("premium");
  }

  /** Arquivar = is_active false: o Worker só serve página ativa. Nada é apagado. */
  async function toggleArchived() {
    setPageError(null);
    setArchiving(true);
    const { error: updateError } = await supabase
      .from("bio_pages")
      .update({ is_active: !page.is_active })
      .eq("id", page.id);
    setArchiving(false);
    if (updateError) return setPageError(updateError.message);
    onChanged();
  }

  /**
   * Apaga a página (os botões vão junto, por cascata no banco) e as imagens do
   * Storage. Os links curtos dos botões ficam: podem estar compartilhados fora
   * da bio, e os cliques são histórico.
   */
  async function deletePage() {
    setPageError(null);
    setDeleting(true);
    const { error: deleteError } = await supabase.from("bio_pages").delete().eq("id", page.id);
    if (deleteError) {
      setDeleting(false);
      return setPageError(deleteError.message);
    }
    // Salvas e as enviadas mas ainda não salvas, pra não sobrar nada no Storage.
    removeBioImages([
      ...new Set([...bioPageImageUrls(page), avatarUrl, backgroundUrl, logoUrl].filter(Boolean)),
    ]);
    setDeleting(false);
    setConfirmDelete(false);
    onDeleted();
  }

  async function savePage() {
    setPageError(null);
    if (!title.trim()) return setPageError("A página precisa de um título.");

    setSavingPage(true);
    const { error: saveError } = await supabase
      .from("bio_pages")
      .update({
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        avatar_url: avatarUrl || null,
        background,
        background_url: backgroundUrl || null,
        logo_url: logoUrl || null,
      })
      .eq("id", page.id);
    setSavingPage(false);

    if (saveError) return setPageError(saveError.message);

    // Agora sim a página no ar parou de usar as imagens antigas.
    removeBioImages([
      page.avatar_url !== (avatarUrl || null) ? page.avatar_url : null,
      page.background_url !== (backgroundUrl || null) ? page.background_url : null,
      page.logo_url !== (logoUrl || null) ? page.logo_url : null,
    ]);

    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
    onChanged();
  }

  /**
   * Cada botão da bio vira um link curto de verdade por baixo. Parece volta
   * maior, mas é o que faz o clique no botão cair no mesmo relatório dos
   * outros links — sem uma segunda máquina de métrica pra manter.
   */
  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const urlError = validateDestinationUrl(newUrl);
    if (urlError) return setError(urlError);

    setAdding(true);

    try {
      const utms = suggestUtms({
        campaign: `bio-${page.slug}`,
        rosto: page.rosto ?? page.slug,
        canal: "bio",
        trafficType: "bio",
        formato: slugTag(newLabel).slice(0, 20),
      });

      const { data: link, error: linkError } = await supabase
        .from("links")
        .insert({
          slug: randomSlug(),
          destination_url: newUrl.trim(),
          final_url: buildFinalUrl(newUrl.trim(), utms),
          title: `bio/${page.slug}: ${newLabel.trim()}`,
          campaign: `bio-${page.slug}`,
          rosto: page.rosto,
          canal: "bio",
          traffic_type: "bio",
          utm_source: utms.utm_source,
          utm_medium: utms.utm_medium,
          utm_campaign: utms.utm_campaign,
          utm_content: utms.utm_content,
        })
        .select()
        .single();

      if (linkError || !link) {
        setError(linkError?.message ?? "Erro ao criar o link do botão.");
        return;
      }

      const nextPosition = (items?.length ?? 0) + 1;

      const { error: itemError } = await supabase.from("bio_page_items").insert({
        page_id: page.id,
        link_id: link.id,
        label: newLabel.trim(),
        position: nextPosition,
        is_active: true,
      });

      if (itemError) {
        setError(itemError.message);
        return;
      }

      setNewLabel("");
      setNewUrl("");
      loadItems();
      onChanged();
    } finally {
      setAdding(false);
    }
  }

  async function move(item: ItemWithStats, direction: -1 | 1) {
    if (!items) return;
    const index = items.findIndex((i) => i.id === item.id);
    const target = items[index + direction];
    if (!target) return;

    await Promise.all([
      supabase
        .from("bio_page_items")
        .update({ position: target.position })
        .eq("id", item.id),
      supabase
        .from("bio_page_items")
        .update({ position: item.position })
        .eq("id", target.id),
    ]);

    loadItems();
  }

  async function removeItem(item: ItemWithStats) {
    // Apaga só o item da página. O link curto continua existindo, porque ele
    // pode já ter sido compartilhado fora da bio — e os cliques dele são
    // histórico que não se joga fora.
    await supabase.from("bio_page_items").delete().eq("id", item.id);
    loadItems();
    onChanged();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start xl:gap-12">
    <div className="min-w-0 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            Página
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-code text-[12px] font-normal text-primary-ink hover:underline"
            >
              {SHORT_DOMAIN}/@{page.slug}
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardTitle>
          <CardDescription>
            É esse endereço que vai na bio do perfil.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-7">
          {/* ---- foto ---- */}
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Foto atual" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-8 w-8 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="space-y-2">
              <span className="eyebrow block">Foto de perfil</span>
              <div className="flex flex-wrap items-center gap-2">
                <UploadButton
                  label={avatarUrl ? "Trocar foto" : "Enviar foto"}
                  busy={uploading === "avatar"}
                  onFile={(file) => handleUpload("avatar", file)}
                />
                {avatarUrl && (
                  <Button variant="ghost" size="sm" onClick={removeAvatar}>
                    <Trash2 />
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-[12px] text-muted-foreground">
                JPG, PNG ou WebP. A foto é recortada em quadrado e reduzida antes de subir.
              </p>
            </div>
          </div>

          {/* ---- textos ---- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bio-title">Título</Label>
              <Input
                id="bio-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bio-subtitle">Subtítulo</Label>
              <Input
                id="bio-subtitle"
                placeholder="uma linha de contexto"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </div>
          </div>

          {/* ---- fundo ---- */}
          <div className="space-y-3">
            <span id="bio-bg-label" className="eyebrow block">
              Plano de fundo
            </span>
            <div
              role="radiogroup"
              aria-labelledby="bio-bg-label"
              className="grid grid-cols-3 gap-3 sm:grid-cols-5"
            >
              {BACKGROUND_KEYS.map((key) => {
                const option = BIO_BACKGROUNDS[key];
                const selected = background === key;
                const isImage = key === "imagem";
                const disabled = isImage && !backgroundUrl;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    title={disabled ? "Envie uma imagem primeiro" : option.label}
                    onClick={() => setBackground(key)}
                    className={cn(
                      "group flex flex-col items-center gap-2 rounded-md p-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                      selected ? "text-primary-ink" : "text-muted-foreground hover:text-foreground",
                      disabled && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <span
                      className={cn(
                        "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[12px] border-2 transition-colors",
                        selected ? "border-primary" : "border-border group-hover:border-primary/40"
                      )}
                      style={
                        isImage
                          ? backgroundUrl
                            ? { backgroundImage: `url("${backgroundUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
                            : undefined
                          : { background: swatchBackground(key) }
                      }
                    >
                      {isImage && !backgroundUrl && (
                        <ImagePlus className="h-5 w-5 text-muted-foreground" aria-hidden />
                      )}
                      {selected && (
                        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <UploadButton
                label={backgroundUrl ? "Trocar imagem de fundo" : "Enviar imagem de fundo"}
                busy={uploading === "fundo"}
                onFile={(file) => handleUpload("fundo", file)}
              />
              {backgroundUrl && (
                <Button variant="ghost" size="sm" onClick={removeBackgroundImage}>
                  <Trash2 />
                  Remover imagem
                </Button>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground">
              Na imagem enviada entra um véu escuro por cima, pra texto e botões
              ficarem legíveis em qualquer foto. Prefira imagem vertical.
            </p>
          </div>

          {/* ---- logo do rodapé ---- */}
          <div className="space-y-3">
            <span className="eyebrow block">Logo no rodapé</span>
            <div className="flex flex-wrap items-center gap-5">
              {/* Amostra sobre o fundo escolhido: logo preto some no Dark. */}
              <div
                className="flex h-16 w-40 shrink-0 items-center justify-center rounded-[12px] border border-border px-4"
                style={
                  background === "imagem" && backgroundUrl
                    ? { backgroundImage: `linear-gradient(rgba(4,7,15,.55),rgba(4,7,15,.55)),url("${backgroundUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: swatchBackground((background in BIO_BACKGROUNDS ? background : "premium") as BioBackgroundKey) }
                }
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo atual" className="max-h-8 max-w-full object-contain" />
                ) : (
                  <span
                    className="text-[11px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: BIO_BACKGROUNDS[(background in BIO_BACKGROUNDS ? background : "premium") as BioBackgroundKey].muted }}
                  >
                    dn.ia
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <UploadButton
                    label={logoUrl ? "Trocar logo" : "Enviar logo"}
                    busy={uploading === "logo"}
                    onFile={(file) => handleUpload("logo", file)}
                  />
                  {logoUrl && (
                    <Button variant="ghost" size="sm" onClick={removeLogo}>
                      <Trash2 />
                      Usar "dn.ia"
                    </Button>
                  )}
                </div>
                <p className="max-w-[360px] text-[12px] text-muted-foreground">
                  Prefira PNG com fundo transparente.{" "}
                  {background === "premium" || background === "warm"
                    ? "Em fundo claro, use a versão escura do logo."
                    : "Em fundo escuro, use a versão clara (branca) do logo."}
                </p>
              </div>
            </div>
          </div>

          {pageError && (
            <p role="alert" className="text-[13px] text-destructive">
              {pageError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-6">
            <Button onClick={savePage} disabled={savingPage || !dirty || uploading !== null}>
              {savingPage ? "Salvando…" : "Salvar página"}
            </Button>
            {dirty ? (
              <span className="text-[12px] text-warning">
                Alterações ainda não publicadas
              </span>
            ) : justSaved ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-success">
                <Check className="h-3.5 w-3.5" />
                Publicado — no ar em até 1 minuto
              </span>
            ) : null}
          </div>

          {/* ---- arquivar / reativar / apagar ---- */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-muted p-4">
            <p className="max-w-[440px] text-[12px] leading-relaxed text-muted-foreground">
              {page.is_active
                ? "Arquivar tira a página do ar (o endereço passa a levar pro site da dn.ia) sem apagar nada. Dá pra reativar depois."
                : "Esta página está arquivada: fora do ar, mas com tudo guardado."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleArchived} disabled={archiving}>
                {page.is_active ? <Archive /> : <ArchiveRestore />}
                {archiving ? "Salvando…" : page.is_active ? "Arquivar" : "Reativar"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Apagar página
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={(open) => !deleting && setConfirmDelete(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar @{page.slug}?</DialogTitle>
            <DialogDescription>
              Isso não pode ser desfeito. A página, os botões dela e as imagens enviadas
              são apagados, e {SHORT_DOMAIN}/@{page.slug} passa a levar pro site da dn.ia.
              Os links curtos dos botões continuam na tela de Links, com os cliques.
            </DialogDescription>
          </DialogHeader>
          {pageError && (
            <p role="alert" className="text-[13px] text-destructive">
              {pageError}
            </p>
          )}
          <DialogFooter>
            <Button variant="destructive" onClick={deletePage} disabled={deleting}>
              {deleting ? "Apagando…" : "Apagar de vez"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Botões</CardTitle>
          <CardDescription>
            Cada botão é um link curto rastreado — o clique aqui aparece no
            mesmo relatório dos outros links.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <form onSubmit={addItem} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
            <div>
              <Label htmlFor="item-label">Texto do botão</Label>
              <Input
                id="item-label"
                required
                placeholder="Agendar reunião estratégica"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="item-url">Destino</Label>
              <Input
                id="item-url"
                type="url"
                required
                placeholder="https://dn.ia/reuniao"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={adding} className="w-full sm:w-auto">
                <Plus />
                {adding ? "Adicionando…" : "Adicionar"}
              </Button>
            </div>
          </form>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          {items === null ? (
            <div className="space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Nenhum botão ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border-subtle bg-muted/50 p-3"
                >
                  <span className="flex-1 truncate text-[13px]">
                    {item.label}
                  </span>

                  <div className="text-right">
                    <p className="font-display text-base font-bold tabular leading-none">
                      {item.clicks}
                    </p>
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      cliques
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      aria-label="Subir"
                      title="Subir"
                      onClick={() => move(item, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === items.length - 1}
                      aria-label="Descer"
                      title="Descer"
                      onClick={() => move(item, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover da página"
                      title="Remover da página"
                      onClick={() => removeItem(item)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    <aside className="lg:sticky lg:top-24">
      <BioPreview
        slug={page.slug}
        title={title}
        subtitle={subtitle}
        avatarUrl={avatarUrl}
        background={background}
        backgroundUrl={backgroundUrl}
        logoUrl={logoUrl}
        items={previewItems}
      />
    </aside>
    </div>
  );
}

export function CreateBioPageForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [rosto, setRosto] = useState("rodrigo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const normalized = slugTag(slug || rosto);
    if (!/^[a-z0-9_-]{2,40}$/.test(normalized)) {
      return setError("Endereço inválido — use 2 a 40 caracteres simples.");
    }

    setSaving(true);

    const { error: insertError } = await supabase.from("bio_pages").insert({
      slug: normalized,
      title: title.trim() || normalized,
      subtitle: null,
      avatar_url: null,
      rosto,
      is_active: true,
    });

    setSaving(false);

    if (insertError) {
      setError(
        insertError.code === "23505"
          ? `O endereço @${normalized} já existe.`
          : insertError.message
      );
      return;
    }

    setSlug("");
    setTitle("");
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova página</CardTitle>
        <CardDescription>
          Uma página por perfil. O endereço fica {SHORT_DOMAIN}/@endereco.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="page-slug">Endereço (@)</Label>
            <Input
              id="page-slug"
              placeholder="rodrigo"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="page-title">Título</Label>
            <Input
              id="page-title"
              placeholder="Rodrigo Nascimento"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label>Rosto</Label>
            <Select value={rosto} onValueChange={setRosto}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROSTOS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-[13px] text-destructive sm:col-span-3">{error}</p>
          )}

          <div className="sm:col-span-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Criando…" : "Criar página"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
