// 滑杆(边框圆角等)

export function Slider({ min = 0, max = 1, step = 0.01, value, onValueChange, className }: {
  min?: number;
  max?: number;
  step?: number;
  value: number[];
  onValueChange: (value: number[]) => void;
  className?: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value[0]}
      onChange={(e) => onValueChange([parseFloat(e.target.value)])}
      className={className}
      style={{ accentColor: "var(--color-primary, #ff6b6b)" }}
    />
  );
}
