#!/usr/bin/env node
// Keyboo 发布脚本:版本 bump → 签名构建 → 发布 GitHub Release(唯一更新源)
//
// 用法:
//   npm run release -- patch|minor|major|x.y.z [--notes "更新说明"]
//
// 前置条件:
//   - git 工作区干净(先提交功能变更)
//   - gh CLI 已登录且有 repo 权限,仓库为 Public(更新端点需匿名访问)
//   - 签名私钥存在:%USERPROFILE%\.tauri\keyboo.key(npx tauri signer generate 生成)
//
// 流程:
//   1. 同步版本号到 package.json / tauri.conf.json / Cargo.toml(+ cargo update -w 同步 lock)
//   2. git commit + tag vX.Y.Z 并推送
//   3. 注入 TAURI_SIGNING_PRIVATE_KEY(可直接填路径)+ 显式空密码后 tauri build
//   4. 生成 latest.json(tauri build 本身不产出,由本脚本按 .sig 拼装,url 为 Release 资产绝对地址)
//   5. gh release create 上传安装包 / 签名 / latest.json
//
// 断点续跑:tag 已存在但 release 未创建时(如上次构建失败),自动跳过版本提交步骤从构建续跑。

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

// ─── 参数解析 ───

const argv = process.argv.slice(2);
const notesIdx = argv.indexOf("--notes");
const notes = notesIdx >= 0 ? argv[notesIdx + 1] : "";
const arg = argv.find((a, i) => a !== "--notes" && argv[i - 1] !== "--notes");
if (!arg) fail("用法:npm run release -- patch|minor|major|x.y.z [--notes \"更新说明\"]");

function nextVersion(current, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const [major, minor, patch] = current.split(".").map(Number);
  switch (bump) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
    default: fail(`未知版本参数:${bump}(支持 patch|minor|major|x.y.z)`);
  }
}

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = nextVersion(pkg.version, arg);
const tag = `v${version}`;
const exeName = `Keyboo_${version}_x64-setup.exe`;
const exe = join(NSIS_DIR, exeName);
const sig = `${exe}.sig`;
const latest = join(NSIS_DIR, "latest.json");

// ─── 前置检查 ───

try {
  sh("gh auth status");
} catch {
  fail("gh CLI 未登录,请先 gh auth login");
}
if (!existsSync(KEY_PATH)) fail(`签名私钥不存在:${KEY_PATH}\n运行 npx tauri signer generate -w "${KEY_PATH}" 生成`);

let releaseExists = false;
try {
  sh(`gh release view ${tag}`);
  releaseExists = true;
} catch { /* 不存在,正常 */ }
if (releaseExists) fail(`Release ${tag} 已存在`);

// 断点续跑:tag 已推送但 release 未创建 → 版本号已提交过,直接从构建继续
const tagExists = Boolean(sh(`git tag -l ${tag}`));
if (!tagExists) {
  if (sh("git status --porcelain")) fail("git 工作区不干净,请先提交当前变更");
  console.log(`→ 发布 ${pkg.version} → ${version}`);

  // ─── 版本号同步(三处 manifest + Cargo.lock) ───

  writeFileSync(pkgPath, JSON.stringify({ ...pkg, version }, null, 2) + "\n");

  const confPath = join(root, "src-tauri", "tauri.conf.json");
  const conf = JSON.parse(readFileSync(confPath, "utf8"));
  conf.version = version;
  writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

  const cargoPath = join(root, "src-tauri", "Cargo.toml");
  writeFileSync(cargoPath, readFileSync(cargoPath, "utf8").replace(/^version = ".*"$/m, `version = "${version}"`));

  // 只更新 lock 中的 workspace 成员版本,不升级第三方依赖
  sh("cargo update -w", { cwd: join(root, "src-tauri") });
  console.log("✓ 版本号已同步(package.json / tauri.conf.json / Cargo.toml / Cargo.lock)");

  // ─── 提交并推送 tag ───

  sh("git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");
  sh(`git commit -m "chore: release ${tag}"`);
  sh(`git tag ${tag}`);
  sh("git push origin HEAD");
  sh(`git push origin ${tag}`);
  console.log(`✓ 已提交并推送 ${tag}`);
} else {
  console.log(`→ tag ${tag} 已存在,从构建步骤续跑`);
}

const visibility = JSON.parse(sh(`gh repo view ${REPO} --json visibility`)).visibility;
if (visibility !== "PUBLIC") fail(`仓库当前为 ${visibility}:更新端点要求 Public,先执行 gh repo edit ${REPO} --visibility public --accept-visibility-change-consequences`);

// ─── 签名构建 ───
// TAURI_SIGNING_PRIVATE_KEY 支持直接填私钥路径;
// 密码变量必须显式设置(哪怕空串),否则非 CI 环境会交互式问密码导致挂死。

console.log("→ tauri build(签名构建)…");
const build = spawnSync("npm", ["run", "tauri", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: KEY_PATH,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
  },
});
if (build.status !== 0) fail("tauri build 失败,修复后重新运行同一命令即可续跑");

for (const f of [exe, sig]) if (!existsSync(f)) fail(`缺少构建产物:${f}`);
const signature = readFileSync(sig, "utf8").trim();
if (!signature) fail(`签名文件为空:${sig}`);
console.log("✓ 构建产物齐全(exe + sig)");

// ─── 生成 latest.json(tauri build 不产出,由脚本拼装) ───
// url 必须是 Release 资产的绝对地址;version 不带 v 前缀。

const manifest = {
  version,
  notes: notes || tag,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: `https://github.com/${REPO}/releases/download/${tag}/${exeName}`,
    },
  },
};
writeFileSync(latest, JSON.stringify(manifest, null, 2));
console.log(`✓ latest.json → ${manifest.platforms["windows-x86_64"].url}`);

// ─── 创建 GitHub Release 并上传资产 ───
// 不加 shell:Windows cmd 会破坏含空格/括号的参数(npm 需要 shell 解析 npm.cmd,
// 但其参数简单安全;gh 必须走参数数组)

const rel = spawnSync(
  "gh",
  [
    "release", "create", tag,
    "--title", `Keyboo ${tag}`,
    ...(notes ? ["--notes", notes] : ["--generate-notes"]),
    exe, sig, latest,
  ],
  { cwd: root, stdio: "inherit" },
);
if (rel.status !== 0) fail(`gh release create 失败;产物在 ${NSIS_DIR},重新运行同一命令即可续跑`);
console.log(`✓ 已发布 https://github.com/${REPO}/releases/tag/${tag}`);
console.log(`  更新端点:https://github.com/${REPO}/releases/latest/download/latest.json`);
