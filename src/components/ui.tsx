// Keyboo 设置页的轻量 UI 组件(自研,无第三方组件库依赖)

import { cn } from "@/lib/utils";
import type { Alignment } from "@/stores/useStyleStore";
import { motion } from "motion/react";
import type { ReactNode } from "react";

// ─── 布局 ───

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

export function Item({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-secondary px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

// ─── 控件 ───

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors duration-150",
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

export function NumberField({ value, onChange, min, max, step = 1, disabled }: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  return (
    <div className={cn("flex h-8 items-center rounded-lg border border-input bg-background", disabled && "opacity-40 pointer-events-none")}>
      <button
        type="button"
        className="px-2 text-muted-foreground hover:text-foreground"
        onClick={() => onChange(clamp(Number((value - step).toFixed(4))))}
      >
        −
      </button>
      <input
        type="number"
        className="w-14 bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(clamp(v));
        }}
      />
      <button
        type="button"
        className="px-2 text-muted-foreground hover:text-foreground"
        onClick={() => onChange(clamp(Number((value + step).toFixed(4))))}
      >
        +
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex h-8 items-center gap-0.5 rounded-lg border border-input bg-background p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-full rounded-md px-2.5 text-xs transition-colors",
            value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SelectField<T extends string>({ options, value, onChange, width = "w-32" }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  width?: string;
}) {
  return (
    <select
      className={cn("h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none", width)}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-background px-2">
      <input
        type="color"
        className="h-5 w-5 cursor-pointer rounded border-none bg-transparent p-0"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="w-16 text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

/** 3×3 对齐选择器 */
export function AlignmentPicker({ value, onChange }: {
  value: Alignment;
  onChange: (value: Alignment) => void;
}) {
  const cells: Alignment[] = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  return (
    <div className="grid h-24 w-24 grid-cols-3 grid-rows-3 gap-1 rounded-lg border border-input bg-background p-1.5">
      {cells.map((cell) => (
        <button
          key={cell}
          type="button"
          onClick={() => onChange(cell)}
          className={cn(
            "rounded-sm transition-colors",
            value === cell ? "bg-primary" : "bg-secondary hover:bg-accent",
          )}
        />
      ))}
    </div>
  );
}
