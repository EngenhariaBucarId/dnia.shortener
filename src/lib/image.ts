/**
 * Upload de imagem da página de bio.
 *
 * A foto que sai do celular tem 4–12 MB e 4000px. Ninguém precisa disso num
 * avatar de 96px: redimensionar e converter pra WebP no navegador antes de
 * subir deixa a página leve pra quem visita e mantém o Storage pequeno.
 */
import { supabase } from "@/lib/supabase";

export const BIO_MEDIA_BUCKET = "bio-media";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
/** Limite antes do redimensionamento — só pra barrar arquivo absurdo. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export const IMAGE_ACCEPT = ACCEPTED.join(",");

export type BioImageKind = "avatar" | "fundo" | "logo";

const RESIZE: Record<BioImageKind, { maxSide: number; square?: boolean }> = {
  avatar: { maxSide: 512, square: true },
  fundo: { maxSide: 1920 },
  logo: { maxSide: 640 },
};

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) {
    return "Use uma imagem JPG, PNG ou WebP.";
  }
  if (file.size > MAX_INPUT_BYTES) {
    return "Imagem grande demais (máximo 20 MB).";
  }
  return null;
}

/** Redimensiona pro maior lado caber em `maxSide` e exporta em WebP. */
export async function resizeImage(
  file: File,
  { maxSide, square = false }: { maxSide: number; square?: boolean }
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  // Avatar: recorte quadrado central, pra foto não sair esmagada no círculo.
  const crop = square ? Math.min(bitmap.width, bitmap.height) : null;
  const sw = crop ?? bitmap.width;
  const sh = crop ?? bitmap.height;
  const sx = crop ? (bitmap.width - crop) / 2 : 0;
  const sy = crop ? (bitmap.height - crop) / 2 : 0;

  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao converter a imagem."))),
      "image/webp",
      0.86
    )
  );
}

/**
 * Sobe a imagem pro Storage e devolve a URL pública. O nome leva timestamp:
 * arquivo novo a cada troca, então nenhum cache (navegador, CDN, WhatsApp)
 * fica servindo a foto antiga.
 */
export async function uploadBioImage(
  pageId: string,
  kind: BioImageKind,
  file: File
): Promise<string> {
  // Logo não é recortado (perderia as bordas) e o WebP mantém a transparência.
  const blob = await resizeImage(file, RESIZE[kind]);

  const path = `${pageId}/${kind}-${Date.now()}.webp`;
  const { error } = await supabase.storage
    .from(BIO_MEDIA_BUCKET)
    .upload(path, blob, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw new Error(error.message);

  return supabase.storage.from(BIO_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Se a URL é de um arquivo nosso no bucket, devolve o caminho dele (pra poder
 * apagar quando a imagem é trocada). URL externa colada à mão → null.
 */
export function bioMediaPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/object/public/${BIO_MEDIA_BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

/** Apaga arquivos que deixaram de ser usados. Falha aqui não é erro de tela. */
export async function removeBioImages(urls: (string | null | undefined)[]) {
  const paths = urls.map(bioMediaPath).filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;
  await supabase.storage.from(BIO_MEDIA_BUCKET).remove(paths);
}
