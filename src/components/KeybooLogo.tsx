// Keyboo 品牌标识(内联 SVG 矢量,任意尺寸不糊)
// 几何与托盘/任务栏图标同源:tools/keyboo-icon.svg(键帽 K 设计)

export function KeybooLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Keyboo"
    >
      <g transform="translate(10 10) scale(0.8)">
        <rect width="100" height="100" rx="24" fill="#141414" />
        <rect x="10" y="8" width="80" height="70" rx="14" fill="#FAFAFA" />
        <g stroke="#141414" strokeWidth="11" strokeLinecap="round" fill="none">
          <path d="M36 24V62" />
          <path d="M64 24L41 42" />
          <path d="M45 39L64 62" />
        </g>
      </g>
    </svg>
  );
}
