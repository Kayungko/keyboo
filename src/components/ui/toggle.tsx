// 切换按钮(边距联动等)

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Toggle({ pressed, onPressedChange, ariaLabel, children, disabled }: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  ariaLabel?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
        pressed
          ? "border-primary bg-primary/15 text-primary"
          : "border-input bg-background text-muted-foreground hover:text-foreground",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}
