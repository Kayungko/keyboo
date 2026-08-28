---
name: "Keyboo 键啵"
description: "安静常驻于 Windows 桌面的炭黑 PBT 输入伙伴"
colors:
  panda-black: "#1d1d1d"
  panda-rice: "#fffdf7"
  note-ink: "#f8f6f1"
  note-muted: "#a9abb1"
  note-faint: "#72767f"
  pbt-charcoal: "#1d1e21"
  pbt-recess: "#101113"
  pbt-raised: "#23252a"
  boundary: "#3b3d42"
  boundary-dark: "#42454c"
  boundary-strong: "#51545c"
  input-yellow: "#fdde27"
  input-yellow-hover: "#ffe65f"
  input-yellow-ink: "#111214"
  destructive: "#ef7474"
typography:
  title:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei, PingFang SC, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 720
    lineHeight: 1.22
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei, PingFang SC, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Cascadia Code, Consolas, Courier New, monospace"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1
  control:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei, PingFang SC, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 680
    lineHeight: 1
rounded:
  field: "4px"
  keycap: "5px"
  control: "6px"
  container: "8px"
  pill: "999px"
spacing:
  grid: "4px"
  xs: "6px"
  sm: "8px"
  control: "10px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  note-window:
    backgroundColor: "{colors.pbt-charcoal}"
    textColor: "{colors.note-ink}"
    rounded: "{rounded.container}"
    width: "292px"
  note-ribbon:
    backgroundColor: "{colors.pbt-charcoal}"
    textColor: "{colors.note-ink}"
    rounded: "{rounded.container}"
    width: "292px"
    height: "52px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.note-muted}"
    rounded: "{rounded.control}"
    size: "28px"
  todo-input:
    backgroundColor: "transparent"
    textColor: "{colors.note-ink}"
    rounded: "{rounded.field}"
    height: "38px"
    padding: "0 11px"
  action-button:
    backgroundColor: "{colors.input-yellow}"
    textColor: "{colors.input-yellow-ink}"
    rounded: "{rounded.field}"
    height: "38px"
    padding: "0 12px"
  index-keycap:
    backgroundColor: "#26282d"
    textColor: "{colors.note-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.keycap}"
    size: "20px"
---

# Design System: Keyboo 键啵

## Overview

**Creative North Star: "The Quiet Keycap Companion / 安静的键帽伙伴"**

Keyboo 的视觉世界来自一颗长期放在桌面的炭黑 PBT 键帽：结构清楚、边缘克制、按下有反馈，但静止时不争夺注意力。熊猫汤圆的黑与米白建立角色亲和力；高饱和黄色只承担输入、焦点与关键动作信号，让“按下去有回应”成为跨表面的触觉签名。

桌面常驻表面优先降低视觉噪声。深浅关系、1px 边界与极浅内高光负责定义层级；短促、可逆的位移和颜色变化负责说明状态。这里不追求通用效率工具的白纸感，也不把玻璃、渐变或大面积发光当作品牌捷径。

**Key Characteristics:**

- 炭黑 PBT 表面与米白文字构成安静、耐看的工作底板。
- 黄色是稀缺的输入信号，而不是装饰色。
- 4px 几何节奏、1px 边界、4–8px 小圆角保持机械精度。
- 等宽字体只用于进度、序号、时间和其他机器状态。
- 状态变化短促、可逆，并尊重 reduced-motion。

## Colors

配色以炭黑中性色为主体，以大黄蜂黄色标记输入与状态；角色米白比普通纯白更温和。

### Primary

- **Input Signal Yellow:** 唯一高饱和强调色，用于输入焦点、主操作、已启用窗口属性、爪印与托盘可恢复提示。
- **Input Signal Hover:** 仅用于黄色主操作的 hover 升亮，不扩展为新强调色。

### Neutral

- **Panda Black / Panda Rice:** 角色识别的黑与米白，属于品牌承诺；不要用泛灰替代角色本体。
- **PBT Charcoal:** 桌面便签的主表面。常驻表面保持固定深色，不随设置窗口主题翻转；系统深色偏好只会把表面加深为 PBT Recess、边界加深为 Boundary Dark，不会切换成另一套视觉世界。
- **PBT Recess / PBT Raised:** 分别用于菜单、浮层的深凹槽与交互项 hover 的一档抬升。
- **Note Ink / Muted / Faint:** 建立正文、辅助信息、弱状态的三级可读性。
- **Boundary / Boundary Strong:** 普通结构线与浮层外缘均为 1px；强边界只给菜单、toast 等临时层。
- **Destructive:** 仅在危险动作的 hover 或错误语义中出现，不与黄色争夺主操作地位。

### Named Rules

**The Yellow Means Input Rule.** 黄色必须能够解释为输入、焦点、完成反馈或可恢复状态；纯装饰不使用黄色。

**The Fixed Overlay Rule.** 桌面常驻覆盖层拥有自己的炭黑可读底板，不把任意壁纸或设置页主题当作背景保证。

## Typography

**Display Font:** Segoe UI Variable（回退至 Segoe UI、Microsoft YaHei、PingFang SC 与 system-ui）  
**Body Font:** Segoe UI Variable（同上）  
**Label/Mono Font:** Cascadia Code（回退至 Consolas、Courier New 与 monospace）

**Character:** 系统无衬线承担自然、低摩擦的中文桌面阅读；等宽字体把进度、序号与时间变成可快速比对的“机器读数”。字体不承担装饰，层级主要来自字重、尺寸和颜色。

### Hierarchy

- **Title**（720，紧凑行高与轻微负字距）：便签标题与当前项目名；保持单行、省略溢出。
- **Body**（400，舒展行高）：待办文本与空状态；小尺寸仍优先清晰，不使用全大写。
- **Label**（等宽、tabular numerals）：进度、键帽序号、完成时间和页码。
- **Control**（680）：黄色主操作和紧凑菜单动作；通过字重获得确定性，不放大抢占空间。

### Named Rules

**The Machine Readout Rule.** 只有数字、时间、键位与状态读数使用等宽字体；自然语言仍用 Segoe UI 系列。

## Layout

所有桌面工具表面以 4px 为基础节奏，常见间距是 8、12、16、20px，局部紧凑对齐允许 6px 与 10px。圆角、控件尺寸与边界都服从这套微型几何，避免把网页式大留白带进 292px 的桌面工具。

桌面便签是固定宽度 292px 的单张聚合原生窗口，默认位于桌面右上角且可拖动、持久化位置。展开态由内容驱动高度，条幅态原生窗口精确收至 52px；两者共享同一顶部锚点。头部、内容、输入区顺序垂直展开；列表行最小高度 36px，输入与主按钮最小高度 38px。列表密度允许一眼扫描，但不得把互斥窗口动作并排堆叠成第二排标题栏。

条幅态打开“更多”菜单时，原生透明窗口临时扩为至少 156px 高，只为承载绝对定位菜单并避免 WebView 裁切；卡片本体仍保持 52px 条幅视觉，关闭菜单后立即回到内容高度。这是窗口载体约束，不得表现为可见的第二张卡片或底板。

**The One Quiet Header Rule.** 便签头部保留标题、进度、收起与一个“更多”入口；置顶与隐藏进入可发现的属性/菜单层，不与日常主操作长期竞争。

## Elevation & Depth

系统默认扁平。PBT 层级主要由色阶、1px 边界和顶部极淡内高光表达；键帽只保留 1px 壁影暗示厚度。较大的环境阴影仅属于暂时浮在内容之上的菜单、toast，或用于评审原型中模拟 Windows 桌面的窗口分离，不应扩散到常驻卡片。

### Shadow Vocabulary

- **PBT Top Edge** (`inset 0 1px 0 rgba(255,255,255,0.04)`): 常驻 PBT 表面的最小材质提示。
- **Keycap Wall** (`0 1px 0 #0f1013`): 序号键帽与主操作的按压厚度；active/pressed 时归零。
- **Floating Menu** (`0 14px 34px rgba(0,0,0,0.42)`): 仅用于临时菜单；关闭后不保留。

### Named Rules

**The Flat-at-Rest Rule.** 常驻表面静止时不靠外投影制造层级；只有临时浮层或正在交互的对象可以离开底板。

## Shapes

Keyboo 使用小而明确的圆角：输入与勾选框为 4px，键帽为 5px，图标控件为 6px，容器与菜单为 8px；只有开关轨道、状态点等天然圆形使用 pill 或 50%。所有结构边界保持 1px。PBT 身份来自双层/壁厚暗示与按压状态，不来自拟真纹理、渐变塑料或夸张倒角。

**The Small Radius Rule.** 工作表面不使用 12px 以上的软糖圆角；大圆角会削弱键帽的机械精度。

## Components

### Desktop Note Window

这是本次表面的专属状态协议，不自动约束其他 Keyboo 窗口。

- **Expanded:** 292px 单张便签承担完整工作；头部展示标题、置顶状态点、进度、收起与一个更多菜单。
- **Collapsed ribbon:** 保留同一头部与窗口属性，WebView 内容与 292px 宽的原生窗口在约 180ms 内共同收至 52px；收纳盒入口隐藏，收起按钮方向反转。条幅不是第二个组件，也不丢失位置或置顶状态。
- **Persisted visible shape:** `collapsed` 由 note store v3 持久化；v1/v2 数据迁移时保留 `todos` 与 `topics`，缺失的 `collapsed` 明确回落为 `false`。隐藏到托盘不修改该值。
- **Hidden to tray:** “隐藏到托盘”只隐藏常驻 WebView，不等于禁用便签。普通动效下先播放 125ms 退场，再隐藏；reduced-motion 下立即隐藏。托盘“便签”项在“已启用但当前隐藏”时负责重新显示，而不是先关闭再打开。
- **Tray and silent restore:** 托盘恢复、重新启用以及退出静默模式均由 Rust 显示窗口并发送 `note-window-restored`；静默模式进入时直接隐藏，退出时仅在便签仍启用时恢复。恢复动画只播放一次，且不得改变 persisted collapsed、置顶或位置。
- **Pinned:** 置顶是 Rust 独占持久窗口属性，以标题旁 5px 黄色点与轻微边界着色表达；开关置于更多菜单，避免占用标题栏主操作位。切换时先乐观更新，原生 `always_on_top` 失败则回滚。
- **More menu:** 188px 宽、8px 圆角、强边界，包含 `menuitemcheckbox`“保持在最前”与 `menuitem`“隐藏到托盘”；危险动作只在 hover 转为 destructive 色。条幅态打开时使用至少 156px 的临时透明窗口承载区，关闭后撤销。

**The Exact Restore Rule.** 托盘恢复的是隐藏前的可见状态，而不是无条件展开，也不得改变置顶属性与窗口位置。

### Buttons

- **Shape:** 图标按钮为 28px 方形、6px 圆角；主操作为 38px 高、4px 圆角。
- **Primary:** 黄色底、深色字、1px 壁影；hover 只升亮一档，active 下移 1px 并去壁影。
- **Icon / Ghost:** 静止透明、muted 色；hover 或展开态使用 raised 表面与 1px 边界。
- **Focus:** 键盘焦点使用 2px 黄色轮廓，通常外偏移 1–2px，不能只依赖颜色变化。
- **Disabled:** 降低不透明度并移除壁影与指针手势，但保留文本可辨识。

### Cards / Containers

- **Corner Style:** 主容器和菜单使用 8px 小圆角。
- **Background:** 常驻便签使用 PBT Charcoal，临时菜单使用更深的 PBT Recess。
- **Shadow Strategy:** 常驻容器仅使用顶部内高光；菜单才使用 Floating Menu 阴影。
- **Border:** 所有外缘与分隔线使用 1px Boundary；激活态可把边界向黄色混合，但不改粗细。
- **Internal Padding:** 便签内容以 20px 水平内边距为主，紧凑头部按 4/8/10/14px 对齐。

### Inputs / Fields

- **Style:** 透明背景、1px Boundary、4px 圆角、38px 高；文本沿 11–12px 水平内边距对齐。
- **Focus:** 边界切换为 Input Signal Yellow，caret 同色；保持背景安静。
- **Error / Disabled:** 错误使用 Destructive；禁用使用透明度，不以黄色假装可操作。

### Task and Project Composer

- **Default path:** 展开且处于进行中视图时，默认始终展示“一行待办 + 添加”表单；输入成功后清空，并跳至新事项所在页。中文 IME 正在组词时，Enter 不提交。
- **One-shot project path:** “新建项目”是待办表单下方的次级文本入口。触发后以单次替换方式显示项目名称输入与“创建并拆解”，而不是在狭窄窗口里叠加第二套表单。
- **Focus lifecycle:** 项目 composer 打开后自动聚焦名称输入；创建成功进入新项目拆解视图。取消或输入框 Escape 会清空草稿、关闭 composer，并把焦点还给“新建项目”入口。
- **Scope:** 项目子视图只显示“添加步骤”，不再出现“新建项目”入口，避免递归层级。

### Keycaps and Todo Rows

- **Index keycap:** 20px 方形、5px 圆角、等宽序号、1px 壁影，是排序把手与 PBT 签名。
- **Todo row:** 36px 最小高度，勾选框、序号键帽、单行文本沿同一基线；长文本省略。
- **Completion:** 勾选框外壳消失，只留下轻微倾斜的黄色爪印；文本降为 muted 并使用 1px 删除线。
- **Press language:** 已按下键帽向下 1px且壁影归零；hover 只提亮，不制造漂浮。

### Menus and Switches

- **Menu item:** 38px 最小高度、5px 圆角、三列结构承载图标、标签和状态。
- **Switch:** 30×18px pill 轨道，10px 圆点；开启时边界、底色混合和圆点共同转为黄色。
- **Motion:** 菜单使用 120–150ms 的淡入与轻微位移/缩放；状态切换使用 140–180ms。reduced-motion 下收敛至近乎即时。
- **Opening and Escape:** 打开菜单时首个项目获得焦点；Escape 或点击外部关闭菜单，并把焦点还给“更多窗口操作”按钮。
- **Roving focus:** ArrowDown / ArrowUp 在两个菜单项之间循环；Home / End 跳到首项 / 末项，同时只保留当前项 `tabIndex=0`。
- **Tab contract:** Tab 关闭菜单并把焦点送到触发按钮之后的下一个页面控件；Shift+Tab 关闭菜单并送到前一个控件。菜单不把 Tab 锁成无限循环。

### Motion and Reduced Motion

- **Default:** 内容与原生窗口高度共同使用约 180ms 的强 ease-out；隐藏使用 125ms 退场，恢复使用一次双 `requestAnimationFrame` 回场；菜单与 composer 为 150–160ms。
- **End-to-end reduction:** `prefers-reduced-motion` 同时约束 CSS、React 与 Rust：取消位移/缩放/旋转，停止菜单、composer、条幅和开关过渡，以淡入或颜色反馈替代；跳过收纳飞行和隐藏/恢复位移；原生 `resize_note_window` 接收 `animate=false` 后直接落到目标高度。
- **State integrity:** reduced-motion 只改变反馈方式，不改变完成、收纳、条幅、置顶、隐藏或恢复结果。

## Do's and Don'ts

### Do:

- **Do** 使用炭黑 PBT 色阶、1px 边界和极浅内高光建立常驻桌面表面的可读性。
- **Do** 把黄色留给输入、焦点、主操作、完成反馈与可恢复状态。
- **Do** 让按压反馈对应真实状态：位移 1px、壁影归零、颜色升亮一档。
- **Do** 对窗口隐藏、收起、置顶分别建立独立状态，并在托盘恢复时保留原可见状态。
- **Do** 提供 `focus-visible` 与 `prefers-reduced-motion` 等价路径。
- **Do** 让 CSS、React 和原生窗口缩放共同响应 reduced-motion，确保视觉与原生载体同步停用位移动效。
- **Do** 让菜单的方向键、Home/End、Tab/Shift+Tab 与 Escape 都产生可预测的焦点去向。

### Don't:

- **Don't** 在标题栏堆叠置顶、收起、隐藏等同权按钮；使用一个更多菜单承载低频窗口属性。
- **Don't** 用玻璃模糊、渐变、纸张纹理、大面积发光或厚重投影替代 PBT 的边界与按压语言。
- **Don't** 把设置窗口的浅色/深色主题直接套到固定深色的桌面便签。
- **Don't** 用等宽字体承载大段中文正文，也不要把黄色当作无语义装饰。
- **Don't** 在隐藏到托盘后丢失窗口位置、置顶属性或 collapsed 状态。
- **Don't** 把条幅菜单所需的 156px 透明承载区绘制成额外表面，也不要让它改变 52px 条幅的视觉高度。
- **Don't** 同时展示默认待办表单和项目 composer；项目创建是一次性的替换路径。
