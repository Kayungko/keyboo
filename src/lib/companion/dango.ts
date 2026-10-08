import normal from "@/assets/dango/normal.png";
import light from "@/assets/dango/light.png";
import strong from "@/assets/dango/strong.png";
import release from "@/assets/dango/release.png";
export const DANGO_FRAMES = { normal, light, strong, release };
export type DangoExpression = keyof typeof DANGO_FRAMES;

export function pullExpression(ratio: number, previous: DangoExpression): DangoExpression {
  // 进入重拉与退出重拉采用不同阈值，避免临界点跳脸。
  return ratio >= (previous === "strong" ? 0.30 : 0.42) ? "strong" : "light";
}
