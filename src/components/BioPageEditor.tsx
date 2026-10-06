import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Plus,
  Trash2,
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
import { Button } from "@/components/ui/button";
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

type ItemWithStats = BioPageItemRow & { clicks: number };

export function BioPageEditor({
  page,
  onChanged,
}: {
  page: BioPageRow;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<ItemWithStats[] | null>(null);
  const [title, setTitle] = useState(page.title);
  const [subtitle, setSubtitle] = useState(page.subtitle ?? "");
  const [avatarUrl, setAvatarUrl] = useState(page.avatar_url ?? "");
  const [savingPage, setSavingPage] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = `https://${SHORT_DOMAIN}/@${page.slug}`;

  const loadItems = useCallback(async () => {
    const [itemsRes, statsRes] = await Promise.all([
      supabase
        .from("bio_page_items")
        .select("*")
        .eq("page_id", page.id)
        .order("position", { ascending: true }),
      supabase.from("v_bio_item_stats").select("*").eq("page_id", page.id),
    ]);

    const clicksByItem = new Map(
      (statsRes.data ?? []).map((row: BioItemStatsRow) => [
        row.item_id,
        row.clicks,
      ])
    );

    setItems(
      (itemsRes.data ?? []).map((item) => ({
        ...item,
        clicks: clicksByItem.get(item.id) ?? 0,
      }))
    );
  }, [page.id]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function savePage() {
    setSavingPage(true);
    await supabase
      .from("bio_pages")
      .update({
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq("id", page.id);
    setSavingPage(false);
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            Página
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[12px] font-normal text-primary-light hover:underline"
            >
              {SHORT_DOMAIN}/@{page.slug}
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardTitle>
          <CardDescription>
            É esse endereço que vai na bio do perfil.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
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
              <Label htmlFor="bio-avatar">URL da foto</Label>
              <Input
                id="bio-avatar"
                placeholder="https://…"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>
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

          <Button size="sm" onClick={savePage} disabled={savingPage}>
            {savingPage ? "Salvando…" : "Salvar página"}
          </Button>
        </CardContent>
      </Card>

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
            <p className="py-6 text-center text-[13px] text-muted-foreground/70">
              Nenhum botão ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border-subtle bg-muted/30 p-3"
                >
                  <span className="flex-1 truncate text-[13px]">
                    {item.label}
                  </span>

                  <div className="text-right">
                    <p className="font-display text-base font-bold tabular leading-none">
                      {item.clicks}
                    </p>
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
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
