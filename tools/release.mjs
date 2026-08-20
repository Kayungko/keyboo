#!/usr/bin/env node
// Keyboo 发布脚本:版本 bump → 签名构建 → 发布 GitHub Release(唯一更新源)
//
// 用法:
//   npm run release -- patch|minor|major|x.y.z
//
// 前置条件:
//   - git 工作区干净(先提交功能变更)
//   - gh CLI 已登录且有 repo 权限
//   - 签名私钥存在:%USERPROFILE%\.tauri\keyboo.key(npm run tauri signer generate 生成)
//
// 流程:
//   1. 同步版本号到 package.json / tauri.conf.json / Cargo.toml(+ Cargo.lock)
//   2. git commit + tag vX.Y.Z 并推送
//   3. TAURI_SIGNING_PRIVATE_KEY_PATH 注入后 tauri build(产出 NSIS 安装包 + .sig + latest.json)
//   4. 改写 latest.json 的下载 url 为 GitHub Release 绝对地址
//   5. gh release create 上传安装包 / 签名 / latest.json

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "Kayungko/keyboo";
const KEY_PATH = join(homedir(), ".tauri", "keyboo.key");
const NSIS_DIR = join(root, "src-tauri", "target", "release", "bundle", "nsis");

const sh = (cmd, opts = {}) =>
  execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();

const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// ─── 1. 解析目标版本 ───

function nextVersion(current, arg) {
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  const [major, minor, patch] = current.split(".").map(Number);
  switch (arg) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
    default: fail(`未知版本参数:${arg}(支持 patch|minor|major|x.y.z)`);
  }
}

const arg = process.argv[2];
if (!arg) fail("用法:npm run release -- patch|minor|major|x.y.z");

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = nextVersion(pkg.version, arg);
const tag = `v${version}`;
console.log(`→ 发布 ${pkg.version} → ${version}`);

// ─── 2. 前置检查 ───

if (sh("git status --porcelain")) fail("git 工作区不干净,请先提交当前变更");
try {
  sh("gh auth status");
} catch {
  fail("gh CLI 未登录,请先 gh auth login");
}
if (!existsSync(KEY_PATH)) fail(`签名私钥不存在:${KEY_PATH}\n运行 npx tauri signer generate -w "${KEY_PATH}" 生成`);
if (sh(`git tag -l ${tag}`)) fail(`tag ${tag} 已存在`);
const visibility = JSON.parse(sh(`gh repo view ${REPO} --json visibility`)).visibility;
if (visibility !== "PUBLIC") console.warn(`⚠ 仓库当前为 ${visibility}:在线更新要求公开仓库,发布后请尽快改为 Public`);

// ─── 3. 版本号同步(三处 manifest + Cargo.lock) ───

writeFileSync(pkgPath, JSON.stringify({ ...pkg, version }, null, 2) + "\n");

const confPath = join(root, "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

const cargoPath = join(root, "src-tauri", "Cargo.toml");
writeFileSync(cargoPath, readFileSync(cargoPath, "utf8").replace(/^version = ".*"$/m, `version = "${version}"`));

// 只更新 lock 中的 workspace 成员版本,不升级第三方依赖
sh("cargo update -w", { cwd: join(root, "src-tauri") });
console.log(`✓ 版本号已同步到 package.json / tauri.conf.json / Cargo.toml / Cargo.lock`);

// ─── 4. 提交并推送 tag ───

sh("git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");
sh(`git commit -m "chore: release ${tag}"`);
sh(`git tag ${tag}`);
sh("git push origin HEAD");
sh(`git push origin ${tag}`);
console.log(`✓ 已提交并推送 ${tag}`);

// ─── 5. 签名构建 ───

console.log("→ tauri build(签名构建,需要几分钟)…");
const build = spawnSync("npm", ["run", "tauri", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PATH: KEY_PATH },
});
if (build.status !== 0) fail("tauri build 失败,修复后重新运行(版本号已提交,重新运行时传相同版本需先回退 commit)");

const exe = join(NSIS_DIR, `Keyboo_${version}_x64-setup.exe`);
const sig = join(NSIS_DIR, `Keyboo_${version}_x64-setup.exe.sig`);
const latest = join(NSIS_DIR, "latest.json");
for (const f of [exe, sig, latest]) if (!existsSync(f)) fail(`缺少构建产物:${f}`);
console.log("✓ 构建产物齐全(exe / sig / latest.json)");

// ─── 6. 改写 latest.json 下载 url 为 Release 资产绝对地址 ───

const manifest = JSON.parse(readFileSync(latest, "utf8"));
const platform = manifest.platforms?.["windows-x86_64"];
if (!platform?.signature) fail("latest.json 缺少 windows-x86_64 签名,检查签名配置");
manifest.version = version;
platform.url = `https://github.com/${REPO}/releases/download/${tag}/Keyboo_${version}_x64-setup.exe`;
writeFileSync(latest, JSON.stringify(manifest, null, 2));
console.log(`✓ latest.json url → ${platform.url}`);

// ─── 7. 创建 GitHub Release 并上传资产 ───

const rel = spawnSync(
  "gh",
  [
    "release", "create", tag,
    "--title", `Keyboo ${tag}`,
    "--generate-notes",
    exe, sig, latest,
  ],
  { cwd: root, stdio: "inherit", shell: true },
);
if (rel.status !== 0) fail(`gh release create 失败;产物在 ${NSIS_DIR},可手动重试该步骤`);
console.log(`✓ 已发布 https://github.com/${REPO}/releases/tag/${tag}`);
