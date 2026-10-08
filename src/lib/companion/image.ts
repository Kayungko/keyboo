import { convertFileSrc } from "@tauri-apps/api/core";

// 两种渲染共用地址；启动与重新导入时都避开旧文件/纹理缓存。
const session = Date.now().toString(36);
export function companionImageUrl(path: string, revision = 0): string {
  return `${convertFileSrc(path)}?v=${session}-${revision}`;
}
