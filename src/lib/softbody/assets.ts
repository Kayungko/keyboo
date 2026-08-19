// 软体皮肤共享资产:角色 SVG 与光栅化工具
//
// BODY_SVG 是汤圆静止帧的唯一来源(BlobSvg 组件用内联 HTML 渲染它,
// 2D 皮肤拉伸期间渲染它的光栅化纹理),两处不会失配。
// 字符串内的 class 是动画钩子,由 app.css 的 keyframes 驱动:
//   .companion-eye   眨眼(一次性触发)
//   .companion-look  张望时眼斑整体平移
//   .companion-nose  张望时鼻子跟随平移(位移略大于眼斑,形成转头透视视差)
//   .companion-ear   耳朵抖动

/** 熊猫汤圆完整角色(无 drop-shadow,阴影由外层容器承担) */
export const BODY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <g transform="rotate(-22 329 324)"><ellipse class="companion-ear" cx="329" cy="324" rx="83" ry="67" fill="#1D1D1D"/></g>
  <g transform="rotate(22 684 318)"><ellipse class="companion-ear" cx="684" cy="318" rx="83" ry="67" fill="#1D1D1D"/></g>
  <path d="M512 256 C672 256 785 374 785 531 C785 683 673 767 508 767 C347 767 239 680 239 531 C239 377 351 256 512 256Z" fill="#FFFDF7"/>
  <path d="M340 402C385 313 484 286 568 305C468 318 390 360 340 443Z" fill="#FFFFFF" opacity=".85"/>
  <g class="companion-look">
    <g transform="rotate(25 407 490)"><ellipse class="companion-eye" cx="407" cy="490" rx="68" ry="91" fill="#1D1D1D"/></g>
    <g transform="rotate(-25 617 490)"><ellipse class="companion-eye" cx="617" cy="490" rx="68" ry="91" fill="#1D1D1D"/></g>
  </g>
  <g class="companion-nose"><ellipse cx="512" cy="585" rx="39" ry="31" fill="#1D1D1D" transform="rotate(-8 512 585)"/></g>
</svg>`;

/** 脸片(仅五官,viewBox 裁到脸部区域,透明背景)——3D 皮肤 decal 用 */
export const FACE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="312 300 400 400">
  <g transform="rotate(25 407 490)"><ellipse cx="407" cy="490" rx="68" ry="91" fill="#1D1D1D"/></g>
  <g transform="rotate(-25 617 490)"><ellipse cx="617" cy="490" rx="68" ry="91" fill="#1D1D1D"/></g>
  <ellipse cx="512" cy="585" rx="39" ry="31" fill="#1D1D1D" transform="rotate(-8 512 585)"/>
</svg>`;

/** SVG → 离屏 canvas(纹理光栅化) */
export function rasterizeSvg(svg: string, size: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("SVG rasterize failed"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

/** 图片 URL → 方形离屏 canvas(contain 居中,与静止帧 object-contain 一致;自定义形象纹理用) */
export function rasterizeImage(url: string, size: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      canvas.getContext("2d")!.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Image rasterize failed"));
    img.src = url;
  });
}
