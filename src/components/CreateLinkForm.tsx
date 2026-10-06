import { useEffect, useMemo, useState } from "react";
import { Check, Copy, RotateCcw, TriangleAlert } from "lucide-react";
import { supabase, shortUrl } from "@/lib/supabase";
import type { LinkRow } from "@/lib/types";
import {
  CANAIS,
  EMPTY_UTMS,
  FORMATOS,
  ROSTOS,
  TRAFFIC_TYPES,
  UTM_KEYS,
  type Utms,
  buildFinalUrl,
  defaultTrafficTypeFor,
  divergingUtmKeys,
  randomSlug,
  suggestUtms,
  validateDestinationUrl,
  validateSlug,
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
import { Badge } from "@/components/ui/badge";

const UTM_LABELS: Record<keyof Utms, string> = {
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_content: "utm_content",
  utm_term: "utm_term",
};

export function CreateLinkForm({
  onCreated,
  knownCampaigns,
}: {
  onCreated: (link: LinkRow) => void;
  knownCampaigns: string[];
}) {
  const [destinationUrl, setDestinationUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [campaign, setCampaign] = useState("");
  const [rosto, setRosto] = useState<string>("rodrigo");
  const [canal, setCanal] = useState<string>("instagram");
  const [trafficType, setTrafficType] = useState<string>("organico");
  const [formato, setFormato] = useState<string>("");

  const [utms, setUtms] = useState<Utms>(EMPTY_UTMS);
  const [utmsTouched, setUtmsTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<LinkRow | null>(null);
  const [copied, setCopied] = useState(false);

  const suggested = useMemo(
    () => suggestUtms({ campaign, rosto, canal, trafficType, formato }),
    [campaign, rosto, canal, trafficType, formato]
  );

  // Enquanto ninguém editou um campo de UTM à mão, eles seguem a convenção.
  useEffect(() => {
    if (!utmsTouched) setUtms(suggested);
  }, [suggested, utmsTouched]);

  const diverging = utmsTouched ? divergingUtmKeys(utms, suggested) : [];
  const finalUrl = destinationUrl ? buildFinalUrl(destinationUrl, utms) : "";

  function handleCanalChange(value: string) {
    setCanal(value);
    // O canal sugere o tipo de tráfego (Meta Ads → pago, e-mail → email).
    setTrafficType(defaultTrafficTypeFor(value));
  }

  function updateUtm(key: keyof Utms, value: string) {
    setUtmsTouched(true);
    setUtms((prev) => ({ ...prev, [key]: value }));
  }

  function restoreConvention() {
    setUtms(suggested);
    setUtmsTouched(false);
  }

  function resetForm() {
    setDestinationUrl("");
    setSlug("");
    setTitle("");
    setFormato("");
    setUtmsTouched(false);
    setCopied(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const urlError = validateDestinationUrl(destinationUrl);
    if (urlError) return setError(urlError);

    if (slug.trim()) {
      const slugError = validateSlug(slug.trim());
      if (slugError) return setError(slugError);
    }

    if (!campaign.trim()) {
      return setError(
        "Dê um nome de campanha — é o que amarra o link ao relatório depois."
      );
    }

    setSaving(true);

    try {
      // Slug customizado é uma tentativa só; slug automático tenta de novo em
      // caso de colisão (rara, mas o banco é a única fonte da verdade).
      const attempts = slug.trim() ? [slug.trim()] : Array.from({ length: 5 }, () => randomSlug());
      let lastError: string | null = null;

      for (const candidate of attempts) {
        const { data, error: insertError } = await supabase
          .from("links")
          .insert({
            slug: candidate,
            destination_url: destinationUrl.trim(),
            final_url: buildFinalUrl(destinationUrl.trim(), utms),
            title: title.trim() || null,
            campaign: campaign.trim(),
            rosto,
            canal,
            traffic_type: trafficType,
            utm_source: utms.utm_source || null,
            utm_medium: utms.utm_medium || null,
            utm_campaign: utms.utm_campaign || null,
            utm_content: utms.utm_content || null,
            utm_term: utms.utm_term || null,
          })
          .select()
          .single();

        if (!insertError && data) {
          setCreated(data);
          onCreated(data);
          resetForm();
          setSaving(false);
          return;
        }

        // 23505 = unique_violation no slug
        if (insertError?.code === "23505") {
          lastError = slug.trim()
            ? `O slug "${candidate}" já está em uso. Escolha outro.`
            : "Colisão de slug, tentando de novo…";
          continue;
        }

        lastError = insertError?.message ?? "Erro ao salvar o link.";
        break;
      }

      setError(lastError ?? "Não foi possível gerar um slug único.");
    } finally {
      setSaving(false);
    }
  }

  async function copyCreated() {
    if (!created) return;
    await navigator.clipboard.writeText(shortUrl(created.slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar link</CardTitle>
        <CardDescription>
          Os UTMs são sugeridos pela convenção a partir de campanha, rosto e
          canal — e ficam editáveis se você precisar fugir dela.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ---- destino e identificação ---- */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="destination">URL de destino *</Label>
              <Input
                id="destination"
                type="url"
                required
                placeholder="https://dn.ia/reuniao-estrategica"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="slug">Slug (vazio = automático)</Label>
                <Input
                  id="slug"
                  placeholder="reuniao-ago26"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="title">Título interno</Label>
                <Input
                  id="title"
                  placeholder="Reel organogram.ia — ago/26"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ---- contexto que gera os UTMs ---- */}
          <div className="space-y-4 border-t border-border-subtle pt-5">
            <span className="eyebrow">Contexto · gera os UTMs</span>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="campaign">Campanha *</Label>
                <Input
                  id="campaign"
                  required
                  list="campanhas-conhecidas"
                  placeholder="lancamento-ago26"
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                />
                <datalist id="campanhas-conhecidas">
                  {knownCampaigns.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
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
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Canal</Label>
                <Select value={canal} onValueChange={handleCanalChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANAIS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tipo de tráfego</Label>
                <Select value={trafficType} onValueChange={setTrafficType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAFFIC_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Formato</Label>
                <Select
                  value={formato || "__none"}
                  onValueChange={(v) => setFormato(v === "__none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATOS.map((f) => (
                      <SelectItem key={f.value} value={f.value || "__none"}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ---- UTMs editáveis ---- */}
          <div className="space-y-4 border-t border-border-subtle pt-5">
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
                    onClick={restoreConvention}
                  >
                    <RotateCcw />
                    Restaurar convenção
                  </Button>
                </>
              ) : (
                <Badge variant="success">Na convenção</Badge>
              )}
            </div>

            {diverging.length > 0 && (
              <p className="text-[12px] leading-relaxed text-warning">
                {diverging.join(", ")} divergem do padrão. Tudo bem se foi de
                propósito — só lembre que valor fora do padrão aparece como
                outra origem no relatório.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {UTM_KEYS.map((key) => (
                <div key={key}>
                  <Label htmlFor={key}>{UTM_LABELS[key]}</Label>
                  <Input
                    id={key}
                    className="font-code text-xs"
                    value={utms[key]}
                    placeholder="—"
                    onChange={(e) => updateUtm(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ---- preview ---- */}
          {finalUrl && (
            <div className="rounded-md border border-border-subtle bg-muted p-4">
              <span className="eyebrow">Destino final com UTM</span>
              <p className="mt-2 break-all font-code text-[11px] leading-relaxed text-primary-ink">
                {finalUrl}
              </p>
            </div>
          )}

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Criando…" : "Criar link curto"}
            </Button>

            {created && (
              <div className="flex items-center gap-2">
                <span className="font-code text-xs text-primary-ink">
                  {shortUrl(created.slug)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={copyCreated}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
