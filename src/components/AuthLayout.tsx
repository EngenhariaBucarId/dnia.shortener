import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Card, CardContent } from "@/components/ui/card";

/** Moldura das telas de acesso (login, esqueci a senha, definir senha). */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex justify-center">
          <BrandLogo size="lg" />
        </div>

        <Card>
          <CardContent className="space-y-6 pt-6 sm:pt-8">
            <div className="space-y-1.5">
              <h1 className="font-display text-xl font-bold tracking-[-0.02em]">{title}</h1>
              {description && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {children}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          Acesso restrito ao time da dn.ia, por convite.
        </p>
      </div>
    </div>
  );
}
