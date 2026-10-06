import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import QRCode from "qrcode";
import { shortUrl } from "@/lib/supabase";
import type { LinkRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * QR code do link curto.
 *
 * Gera no navegador, sem serviço externo: nenhum link de vocês vaza pra API de
 * terceiro só pra virar quadradinho. Correção de erro em nível alto (H) porque
 * QR de material impresso e de evento presencial toma dobra, luz ruim e
 * leitura torta — o nível H aguenta ~30% do código danificado.
 *
 * PNG serve pra slide e story; SVG é o que a gráfica pede, porque escala sem
 * perder definição em banner e totem.
 */
export function QrCodeDialog({
  link,
  open,
  onOpenChange,
}: {
  link: LinkRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = shortUrl(link.slug);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setPngUrl(null);
    setSvgMarkup(null);
    setError(null);

    const options = {
      errorCorrectionLevel: "H" as const,
      margin: 2,
      width: 1024,
      color: { dark: "#0A0A0A", light: "#FFFFFF" },
    };

    Promise.all([
      QRCode.toDataURL(url, options),
      QRCode.toString(url, { ...options, type: "svg" }),
    ])
      .then(([png, svg]) => {
        if (!active) return;
        setPngUrl(png);
        setSvgMarkup(svg);
      })
      .catch(() => {
        if (active) setError("Não foi possível gerar o QR code.");
      });

    return () => {
      active = false;
    };
  }, [open, url]);

  function download(href: string, extension: string) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `qr-${link.slug}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function downloadSvg() {
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    download(href, "svg");
    URL.revokeObjectURL(href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR code</DialogTitle>
          <DialogDescription>
            Aponta pra{" "}
            <span className="font-mono text-primary-light">{url}</span>, então
            todo scan entra na mesma métrica do link.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          {error ? (
            <p className="py-10 text-[13px] text-destructive">{error}</p>
          ) : pngUrl ? (
            <img
              src={pngUrl}
              alt={`QR code do link ${url}`}
              className="h-56 w-56 rounded-md bg-white p-2"
            />
          ) : (
            <Skeleton className="h-56 w-56" />
          )}
        </div>

        <DialogFooter className="justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={!pngUrl}
            onClick={() => pngUrl && download(pngUrl, "png")}
          >
            <Download />
            PNG
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!svgMarkup}
            onClick={downloadSvg}
          >
            <Download />
            SVG (impressão)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
