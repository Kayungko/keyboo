// 柯基实验伙伴：分层内联 SVG。
// 节点 id 是 Companion Rig v1 的稳定动画契约；class 兼容现有眨眼/张望/耳抖调度。
// 使用内联而非 <img>，让外层 CSS 动画能命中 SVG 内部节点。

import corgiRaw from "@/assets/corgi.svg?raw";

export function CorgiSvg() {
  return <div className="companion-corgi-svg" dangerouslySetInnerHTML={{ __html: corgiRaw }} />;
}
