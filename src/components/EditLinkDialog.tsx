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
 * Edição de destino — a função que faz um encurtador valer a pena.
 *
 * O slug NÃO muda: o link que já está impresso num banner, no story de ontem
 * ou em 40 posts continua funcionando. Muda só pra onde ele aponta. E como os
 * cliques ficam presos ao id do link, o histórico anterior não se perde — o
 * que você vê depois é o mesmo link, com destino novo.
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
  const finalUrl = buildFinalUrl(destinationUrl, utms);

  async function handleSave() {
    setError(null);

    const urlError = validateDestinationUrl(destinationUrl);
    if (urlError) return setError(urlError);

    setSaving(true);

    const { error: updateError } = await supabase
      .from("links")
      .update({
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

    if (updateError) return setError(updateError.message);

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar destino</DialogTitle>
          <DialogDescription>
            O link curto{" "}
            <span className="font-mono text-primary-light">
              {shortUrl(link.slug)}
            </span>{" "}
            continua o mesmo. Muda só pra onde ele leva — e os cliques já
            registrados seguem no histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                    className="font-mono text-xs"
                    value={utms[key]}
                    onChange={(e) =>
                      setUtms((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
            <span className="eyebrow">Novo destino final</span>
            <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-primary-light">
              {finalUrl}
            </p>
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar destino"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
