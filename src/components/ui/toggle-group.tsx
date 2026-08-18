// 按钮组(过滤模式、排列方向等)

import { cn } from "@/lib/utils";
import { createContext, useContext, type ReactNode } from "react";

const ToggleGroupContext = createContext<{
  value: string;
  onValueChange: (value: string) => void;
  size: "default" | "sm";
}>({ value: "", onValueChange: () => {}, size: "default" });

export function ToggleGroup({ value, onValueChange, size = "default", className, children }: {
  value: string;
  onValueChange: (value: string) => void;
  size?: "default" | "sm";
  className?: string;
  children: ReactNode;
}) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange, size }}>
      <div className={cn("inline-flex items-center gap-0.5 rounded-lg border border-input bg-background p-0.5", className)}>
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

export function ToggleGroupItem({ value, className, children, disabled }: {
  value: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const group = useContext(ToggleGroupContext);
  const active = group.value === value;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => group.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-md transition-colors disabled:opacity-40",
        group.size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
