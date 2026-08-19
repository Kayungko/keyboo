// 道童静止帧:内联渲染 daotong.svg(?raw 字符串,与皮肤拉伸纹理同源)。
// 必须内联而非 <img src> —— CSS 动画钩子(.companion-halo 灵光)在 SVG 内部,
// <img> 边界会阻断外部样式表命中 SVG 子元素(汤圆 BODY_SVG 同理)。
// 道童是竖向图(680:839),内联后在正方形容器内等比缩放居中(见 app.css .companion-daotong-svg)。

import daotongRaw from "@/assets/daotong.svg?raw";

export function DaotongSvg() {
  return (
    <div className="aspect-square w-full">
      <div className="companion-daotong-svg" dangerouslySetInnerHTML={{ __html: daotongRaw }} />
    </div>
  );
}
