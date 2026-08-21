<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Keyboo" />
</p>

<h1 align="center">Keyboo 键啵</h1>

<p align="center">
  桌面按键可视化与打字伙伴——屏幕上实时显示你按下的键、点下的鼠标,<br/>
  还有一只小角色陪你打字、攒经验、慢慢长大。
</p>

<p align="center">
  <a href="https://github.com/Kayungko/keyboo/releases/latest"><img src="https://img.shields.io/github/v/release/Kayungko/keyboo?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC&color=141414" alt="最新版本" /></a>
  <a href="https://github.com/Kayungko/keyboo/releases"><img src="https://img.shields.io/github/downloads/Kayungko/keyboo/total?label=%E4%B8%8B%E8%BD%BD%E9%87%8F" alt="下载量" /></a>
  <img src="https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%2010%2B-blue" alt="平台" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/%E5%8D%8F%E8%AE%AE-MIT-green" alt="MIT" /></a>
</p>

## ✨ 特性

### 🎹 按键浮层

- 实时显示按键与组合键(`+` 连接符、修饰键主次层级),键帽角落显示连击计数
- 四种键帽样式:极简 / 笔记本 / 矮轴 / PBT
- 五种进出场动画(spring 入场 + 利落收尾)
- 历史模式:保留最近按键组,旧组自动衰减形成层次

### 🖱️ 鼠标反馈

- 点击圆环快速咬合 + 释放涟漪扩散,右键虚线环区分
- 光标旁按键 / 滚轮状态指示器
- 可选移动拖尾,颜色与淡出速度可调

### 🐶 打字伙伴

- 三只预设角色:键啵 / 道童 / 柯基,各自独立经验存档与成长线
- Q 弹软体物理:左键拉拽果冻形变,右键拖动位置
- 皮肤可换(软体 / 3D 软体 / 角色形象),也支持导入本地图片做自定义形象

### 🔋 AI 额度监控

- API Key 类:OpenRouter / DeepSeek / Moonshot Kimi / 硅基流动 / Stability AI
- 本机登录态:Codex CLI / Gemini CLI,额度余量一目了然

### ⚙️ 系统集成

- **静默模式**:托盘一键进入,屏幕清空但继续收集——录屏输入密码时用它
- **暂停/恢复**:`Shift + F10` 全局快捷键或托盘菜单,切换时右下角角标提示
- **卡键自愈**:安全桌面(Ctrl+Alt+Del)丢失释放事件时自动清理残留键帽
- 浅色 / 深色 / 跟随系统主题,全中文界面,简中 NSIS 安装包
- 应用内检查更新(GitHub Releases,签名校验)

## 📦 下载安装

到 [Releases](https://github.com/Kayungko/keyboo/releases/latest) 下载
`Keyboo_x.y.z_x64-setup.exe` 双击安装即可。

> **注意**:v0.4.0 之前的版本不含更新模块,无法自动更新,请下载最新安装包覆盖安装。

## 🛠️ 开发

```bash
npm install          # 安装前端依赖
npm run tauri dev    # 开发模式
npm run tauri build  # 构建(产物在 src-tauri/target/release 与 bundle/nsis)
```

技术栈:Tauri 2 + React 19 + TypeScript + Zustand + Motion + Tailwind CSS 4。
输入捕获为自研 Windows 低级钩子实现(`src-tauri/src/input.rs`)。

## 🚀 发布

```bash
npm run release -- patch   # 或 minor / major / 指定版本 x.y.z
```

一键完成:版本 bump → 提交打 tag → 签名构建(NSIS 安装包 + .sig + latest.json)→
创建 GitHub Release。更新源为 GitHub Releases,签名私钥与前置条件详见
`tools/release.mjs` 头部注释。

## 🗺️ 路线图

- AI 额度:支持 Claude Code / GitHub Copilot / Cursor / Windsurf
- OBS 色键输出

## 📄 许可

[MIT](./LICENSE) © 2026 Keyboo
