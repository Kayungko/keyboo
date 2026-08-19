// 熊猫汤圆静止帧:内联渲染 BODY_SVG(与 2D 皮肤拉伸纹理同源,避免双份维护)。
// 动画钩子(class)在 SVG 字符串内,由外层容器的状态类驱动(见 app.css)。

import { BODY_SVG } from "@/lib/softbody/assets";

export function BlobSvg() {
  return <div className="companion-blob-svg" dangerouslySetInnerHTML={{ __html: BODY_SVG }} />;
}
