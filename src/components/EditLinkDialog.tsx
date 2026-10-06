import { useMemo, useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { supabase, shortUrl } from "@/lib/supabase";
import type { LinkRow } from "@/lib/types";
import {
  UTM_KEYS,
  type Utms,
  buildFinalUrl,
  divergingUtmKeys,
  suggestUtms,
  validateDestinationUrl,
  validateSlug,
} from "@/lib/utm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Edição de link — a função que faz um encurtador valer a pena.
 *
 * O caso normal é trocar só o destino: o link que já está impresso num
 * banner, no story de ontem ou em 40 posts continua funcionando, e como os
 * cliques ficam presos ao id do link, o histórico não se perde.
 *
 * O slug também pode mudar, mas aí o endereço antigo morre na hora (o Worker
 * resolve por slug e não guarda alias). Por isso trocar o slug exige marcar
 * uma confirmação explícita. Cliques antigos e botões de bio seguem o link,
 * porque os dois apontam pro id, não pro slug.
 */
export function EditLinkDialog({
  link,
  open,
  onOpenChange,
  onSaved,
}: {
  link: LinkRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(link.slug);
  const [slugConfirmed, setSlugConfirmed] = useState(false);
  const [destinationUrl, setDestinationUrl] = useState(link.destination_url);
  const [title, setTitle] = useState(link.title ?? "");
  const [utms, setUtms] = useState<Utms>({
    utm_source: link.utm_source ?? "",
    utm_medium: link.utm_medium ?? "",
    utm_campaign: link.utm_campaign ?? "",
    utm_content: link.utm_content ?? "",
    utm_term: link.utm_term ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggested = useMemo(
    () =>
      suggestUtms({
        campaign: link.campaign ?? "",
        rosto: link.rosto ?? "",
        canal: link.canal ?? "",
        trafficType: link.traffic_type ?? "",
        formato: "",
      }),
    [link]
  );

  const diverging = divergingUtmKeys(utms, suggested);
  const nextSlug = slug.trim();
  const slugChanged = nextSlug !== link.slug;
  const finalUrl = buildFinalUrl(destinationUrl, utms);

  async function handleSave() {
    setError(null);

    if (slugChanged) {
      const slugError = validateSlug(nextSlug);
      if (slugError) return setError(slugError);
      if (!slugConfirmed) {
        return setError(
          "Confirme que o endereço antigo pode parar de funcionar antes de trocar o slug."
        );
      }
    }

    const urlError = validateDestinationUrl(destinationUrl);
    if (urlError) return setError(urlError);

    setSaving(true);

    const { error: updateError } = await supabase
      .from("links")
      .update({
        ...(slugChanged ? { slug: nextSlug } : {}),
        destination_url: destinationUrl.trim(),
        final_url: buildFinalUrl(destinationUrl.trim(), utms),
        title: title.trim() || null,
        utm_source: utms.utm_source || null,
        utm_medium: utms.utm_medium || null,
        utm_campaign: utms.utm_campaign || null,
        utm_content: utms.utm_content || null,
        utm_term: utms.utm_term || null,
      })
      .eq("id", link.id);

    setSaving(false);

    if (updateError) {
      // 23505 = unique_violation no slug
      return setError(
        updateError.code === "23505"
          ? `O slug "${nextSlug}" já está em uso. Escolha outro.`
          : updateError.message
      );
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar link</DialogTitle>
          <DialogDescription>
            Troque pra onde{" "}
            <span className="font-code text-primary-ink">
              {shortUrl(link.slug)}
            </span>{" "}
            leva sem mudar o endereço. Os cliques já registrados seguem no
            histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-slug">Slug</Label>
            <Input
              id="edit-slug"
              className="font-code"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugConfirmed(false);
              }}
            />
            {slugChanged && nextSlug && (
              <p className="mt-1.5 break-all font-code text-[11px] text-muted-foreground">
                novo endereço:{" "}
                <span className="text-primary-ink">{shortUrl(nextSlug)}</span>
              </p>
            )}
          </div>

          {slugChanged && (
            <div
              role="alert"
              className="space-y-3 rounded-md border border-warning/40 bg-warning/10 p-3"
            >
              <p className="flex gap-2 text-[12px] leading-relaxed text-warning">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-code">{shortUrl(link.slug)}</span> para
                  de funcionar assim que você salvar. Post publicado, story e QR
                  code impresso com o endereço antigo vão cair no fallback. Os
                  cliques antigos e os botões de bio continuam valendo.
                </span>
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground/90">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={slugConfirmed}
                  onChange={(e) => setSlugConfirmed(e.target.checked)}
                />
                Entendi, o endereço antigo pode parar de funcionar
              </label>
            </div>
          )}
          <div>
            <Label htmlFor="edit-destination">URL de destino</Label>
            <Input
              id="edit-destination"
              type="url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="edit-title">Título interno</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-3 border-t border-border-subtle pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="eyebrow">UTMs</span>
              {diverging.length > 0 ? (
                <>
                  <Badge variant="warning">
                    <TriangleAlert className="mr-1 h-3 w-3" />
                    Fora da convenção
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setUtms(suggested)}
                  >
                    <RotateCcw />
                    Restaurar
                  </Button>
                </>
              ) : (
                <Badge variant="success">Na convenção</Badge>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {UTM_KEYS.map((key) => (
                <div key={key}>
                  <Label htmlFor={`edit-${key}`}>{key}</Label>
                  <Input
                    id={`edit-${key}`}
                    className="font-code text-xs"
                    value={utms[key]}
                    onChange={(e) =>
                      setUtms((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border-subtle bg-muted p-3">
            <span className="eyebrow">Novo destino final</span>
            <p className="mt-1.5 break-all font-code text-[11px] leading-relaxed text-primary-ink">
              {finalUrl}
            </p>
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={saving || (slugChanged && !slugConfirmed)}
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
