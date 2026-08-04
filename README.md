# suxing412.github.io

我的个人作品集网站，部署在 GitHub Pages：**https://suxing412.github.io**

我是苏省（Xing Su），RIT 游戏设计专业，方向是系统策划与关卡设计。这个网站用来放我的项目复盘和联系方式。

## 内容

- **主页**（index.html）：单栏叙事流——自我介绍 → 作品集 → 档案 → 设计理念 → 联系方式
- **项目详情页**：
  - `ck3-teardown.html` — 《十字军之王 3》系统拆解（重点项目）
  - `monsterpedia.html` — 像素风侦探游戏，系统策划 & 主程
  - `sailors.html` — 海战桌游，主策 & 数值
  - `tank-battle.html` — 双人坦克对抗原型，操控与关卡编辑器
- **监制台**（[Ticketflow](https://github.com/suxing412/Ticketflow)）：AI 工作流管理工具，单独一个仓库
- `404.html`：GitHub Pages 自动启用的 404 页

## 技术说明

纯手写 HTML / CSS / JavaScript，无框架、无构建步骤。

- `CSS/style.css` — 全站设计令牌（颜色、字号、间距、层级都在 `:root` 里）+ 主页布局。视觉主题是"系统蓝图"：制图纸网格背景、深蓝底、琥珀批注色
- `CSS/detail.css` — 详情页专属样式，依赖 style.css 的令牌
- `js/main.js` — 背景节点图动效（canvas）、导航锚点高亮、图片查看器（lightbox）、联系方式一键复制。`prefers-reduced-motion` 下动效全部降级
- `ChenSiruo-Regular.woff2 / .woff` — 手书字体，只含"赠君明月满前溪，直到西湖畔"十二个字，用于页脚落款。**这两个文件不要删。**

## 本地预览

任意静态服务器都行，比如：

```bash
npx serve .
# 或
python -m http.server 8000
```

直接双击 index.html 用 file:// 打开也能看，但联系方式复制等功能需要 localhost 或 https。

## 维护备忘

- **加新项目**：在 index.html 的 `#project-list-container` 里照抄一个 `.project-card` 结构即可（卡片是静态 HTML，没有数据文件）
- **简历**：放到 `Demos/苏省-简历.pdf`，各页的简历按钮就会生效
- **改配色/字号**：只改 `style.css` 顶部 `:root` 里的变量
- `/resume/`、`/.claude/`、`/.impeccable/` 在 .gitignore 里，不会发布
