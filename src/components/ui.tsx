// Keyboo 设置页 UI 组件库(自研轻量实现,交互对齐 Keyviz)

import { cn } from "@/lib/utils";
import type { Alignment } from "@/stores/useStyleStore";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";

// ─── 区块 ───

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

// ─── Item 卡片行(Keyviz 结构) ───

export function Item({ variant = "default", className, children }: {
  variant?: "default" | "muted";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(
      "flex items-center gap-4 rounded-xl border border-border px-4 py-3",
      variant === "muted" && "bg-secondary border-transparent",
      className,
    )}>
      {children}
    </div>
  );
}

export function ItemContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("min-w-0 flex-1", className)}>{children}</div>;
}

export function ItemHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex items-center gap-2", className)}>{children}</div>;
}

export function ItemTitle({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 text-sm font-medium">{children}</div>;
}

export function ItemDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mt-0.5 text-xs text-muted-foreground", className)}>{children}</div>;
}

export function ItemActions({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex shrink-0 items-center gap-2", className)}>{children}</div>;
}

export function ItemGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

export function ItemGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-3 md:grid-cols-2", className)}>{children}</div>;
}

// ─── 按钮 ───

export function Button({ variant = "default", size = "default", className, onClick, disabled, children }: {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon" | "icon-sm";
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors",
        "disabled:opacity-40 disabled:pointer-events-none",
        variant === "default" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "outline" && "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        variant === "ghost" && "hover:bg-accent hover:text-accent-foreground",
        size === "default" && "h-8 px-3",
        size === "sm" && "h-8 px-2.5",
        size === "icon" && "h-8 w-8",
        size === "icon-sm" && "h-7 w-7",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ─── 开关 ───

export function Switch({ checked, onChange, disabled }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150",
        checked ? "bg-primary" : "bg-border",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

// ─── 数字输入 ───

export function NumberField({ value, onChange, min, max, step = 1, disabled, className }: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}) {
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  // 输入草稿:打字期间保留用户原文,不实时钳制——
  // 否则输入中间值(如想打 100 先出现 1)会被立刻改写,无法键入
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null) {
      const v = parseFloat(draft);
      if (!Number.isNaN(v)) onChange(clamp(v));
    }
    setDraft(null);
  };

  return (
    <div className={cn(
      "flex h-8 items-center rounded-lg border border-input bg-background",
      disabled && "opacity-40 pointer-events-none",
      className,
    )}>
      <button type="button" className="px-2 text-muted-foreground hover:text-foreground"
        onClick={() => { setDraft(null); onChange(clamp(Number((value - step).toFixed(4)))); }}>−</button>
      <input
        type="number"
        className="w-12 bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={draft ?? Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          // 范围内的合法输入实时生效(预览联动),越界值延后到失焦时钳制
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v) && v >= (min ?? -Infinity) && v <= (max ?? Infinity)) onChange(v);
        }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      />
      <button type="button" className="px-2 text-muted-foreground hover:text-foreground"
        onClick={() => { setDraft(null); onChange(clamp(Number((value + step).toFixed(4)))); }}>+</button>
    </div>
  );
}

// ─── 分段选择 ───

export function Segmented<T extends string>({ options, value, onChange, size = "default" }: {
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "default" | "sm";
}) {
  return (
    <div className={cn(
      "inline-flex items-center gap-0.5 rounded-lg border border-input bg-background p-0.5",
      size === "sm" && "p-0.5",
    )}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.ariaLabel}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md transition-colors",
            size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ─── 下拉选择 ───

export function SelectField<T extends string>({ options, value, onChange, width = "w-32", placeholder }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  width?: string;
  placeholder?: string;
}) {
  return (
    <select
      className={cn("h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none", width)}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

// ─── 颜色选择 ───

// 解析 #rgb / #rrggbb / #rrggbbaa,返回纯 RGB(6 位小写)与 alpha(0~1)
function parseHex(value: string): { rgb: string; alpha: number } {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value.trim());
  if (!m) return { rgb: "#ffffff", alpha: 1 };
  const hex = m[1];
  if (hex.length === 3) {
    return { rgb: `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase(), alpha: 1 };
  }
  if (hex.length === 6) return { rgb: `#${hex.toLowerCase()}`, alpha: 1 };
  return { rgb: `#${hex.slice(0, 6).toLowerCase()}`, alpha: parseInt(hex.slice(6, 8), 16) / 255 };
}

function alphaToHex(alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return a.toString(16).padStart(2, "0");
}

export function ColorField({ value, onChange, disabled, className }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { rgb, alpha } = parseHex(value);
  const setRgb = (nextRgb: string) => onChange(alpha >= 1 ? nextRgb : `${nextRgb}${alphaToHex(alpha)}`);
  const setAlpha = (nextAlpha: number) => onChange(nextAlpha >= 1 ? rgb : `${rgb}${alphaToHex(nextAlpha)}`);

  return (
    <div className={cn(
      "flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-2",
      disabled && "opacity-40 pointer-events-none",
      className,
    )}>
      <input
        type="color"
        className="h-5 w-5 shrink-0 cursor-pointer rounded border-none bg-transparent p-0"
        value={rgb}
        onChange={(e) => setRgb(e.target.value)}
      />
      <input
        className="w-16 shrink-0 bg-transparent text-xs text-muted-foreground outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {/* 透明度滑块:0~100% */}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(alpha * 100)}
        onChange={(e) => setAlpha(Number(e.target.value) / 100)}
        className="h-1 w-14 shrink-0 cursor-pointer appearance-none rounded-full bg-secondary accent-foreground"
      />
      <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
        {Math.round(alpha * 100)}%
      </span>
    </div>
  );
}

// ─── 3×3 对齐选择器 ───

export function AlignmentPicker({ value, onChange, className, disabledOptions = [] }: {
  value: Alignment;
  onChange: (value: Alignment) => void;
  className?: string;
  disabledOptions?: Alignment[];
}) {
  const cells: Alignment[] = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  return (
    <div className={cn("grid grid-cols-3 grid-rows-3 gap-1 rounded-lg border border-input bg-background p-1.5", className ?? "h-24 w-24")}>
      {cells.map((cell) => {
        const disabled = disabledOptions.includes(cell);
        return (
          <button
            key={cell}
            type="button"
            disabled={disabled}
            onClick={() => onChange(cell)}
            className={cn(
              "rounded-sm transition-colors",
              value === cell ? "bg-primary" : "bg-secondary hover:bg-accent",
              disabled && "opacity-20 pointer-events-none",
            )}
          />
        );
      })}
    </div>
  );
}
