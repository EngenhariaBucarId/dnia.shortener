import { cn } from "@/lib/utils";

/**
 * Logo oficial <dn.ia> (o mesmo arquivo do designsystem.dnia.ai e do site) +
 * o nome do produto. O logo é imagem, nunca redesenhado em texto: o ponto
 * vermelho e o pingo azul fazem parte da marca.
 */
export function BrandLogo({
  size = "md",
  className,
}: {
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center", size === "lg" ? "gap-4" : "gap-3", className)}>
      <img
        src="/logo/dnia-preto.png"
        alt="dn.ia"
        width={1675}
        height={370}
        className={cn("w-auto", size === "lg" ? "h-8" : "h-5")}
      />
      <span
        aria-hidden
        className={cn("w-px bg-border", size === "lg" ? "h-7" : "h-5")}
      />
      <span
        className={cn(
          "font-display font-semibold tracking-tight text-foreground",
          size === "lg" ? "text-2xl" : "text-[15px]"
        )}
      >
        links
      </span>
    </span>
  );
}
