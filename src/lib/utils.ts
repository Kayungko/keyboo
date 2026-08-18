export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

// ─── oklch 相对颜色工具(基于 CSS relative color syntax) ───

export function lighten(hex: string, l: number): string {
  return `oklch(from ${hex} clamp(0, calc(l + ${l}), 1) c h)`;
}

export function darken(hex: string, l: number): string {
  return `oklch(from ${hex} clamp(0, calc(l - ${l}), 1) c h)`;
}

// ─── 缓动曲线 ───

export type BezierDefinition = [number, number, number, number];

export const easeOutQuint: BezierDefinition = [0.23, 1.0, 0.32, 1.0];
export const easeInQuint: BezierDefinition = [0.76, 0.05, 0.86, 0.06];
export const easeInOutExpo: BezierDefinition = [0.86, 0.0, 0.07, 1.0];
export const easeOutPress: BezierDefinition = [0.32, 0.72, 0, 1];
export const easeOutRipple: BezierDefinition = [0.22, 1, 0.36, 1];
