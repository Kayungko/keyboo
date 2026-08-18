// 拖动调数控件:按住左右拖动连续调整(边距、偏移用)

import { cn } from "@/lib/utils";
import { useRef, useState, type ReactNode } from "react";

export function NumberScrubber({ value, onChange, min = 0, max = 200, step = 1, icon, className, disabled }: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startValue: number } | null>(null);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    setDragging(true);
    dragRef.current = { startX: e.clientX, startValue: value };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    const next = clamp(Math.round((dragRef.current.startValue + delta * step * 0.5) / step) * step);
    onChange(next);
  };

  const handlePointerUp = () => {
    setDragging(false);
    dragRef.current = null;
  };

  return (
    <div
      className={cn(
        "flex h-8 select-none items-center gap-1 rounded-lg border border-input bg-background px-2",
        disabled ? "opacity-40 pointer-events-none" : "cursor-ew-resize",
        dragging && "ring-2 ring-ring",
        className,
      )}
      title="按住左右拖动调整数值"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {icon}
      <input
        type="number"
        className="w-10 bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        min={min}
        max={max}
        step={step}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(clamp(v));
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
