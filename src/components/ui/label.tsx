import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "mb-1.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground peer-disabled:opacity-60",
      className
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
