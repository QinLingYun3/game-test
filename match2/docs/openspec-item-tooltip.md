# OpenSpec: 道具 Hover 气泡提示（Item Tooltip）

```yaml
id: match2-item-tooltip
version: 1.0.0
status: draft
author: Game Team
date: 2026-06-22
```

---

## 1. 背景

当前道具（烟雾弹、混乱、快速消除）使用 HTML 原生 `title` 属性显示提示，样式不可控且简陋。需求改为：hover 到道具图标上时，弹出**圆角气泡文字框**，显示道具名称 + 使用方式说明。

---

## 2. 需求

| ID | 需求 | 优先级 |
|---|---|---|
| F1 | 鼠标 hover 到任意道具图标上，延迟约 0.2s 后弹出气泡 | P0 |
| F2 | 气泡内容包含：**道具名称** + **一行使用说明** | P0 |
| F3 | 气泡样式：深色半透明背景、圆角（12px）、白色文字、小箭头指向图标中心 | P0 |
| F4 | 鼠标离开图标后气泡立即消失 | P0 |
| F5 | 三种道具各自有不同的说明文案，支持多语言 | P0 |
| F6 | 移除原生的 `title` 属性，避免浏览器默认 tooltip 与自定义气泡重叠 | P0 |

---

## 3. 文案（i18n）

| Key | zh | en | fr |
|---|---|---|---|
| `item.smokeDesc` | 拖放到对手头像使用，或双击自动给最高分对手 | Drag onto opponent, or double-click for highest scorer | Glissez sur un adversaire, ou double-clic pour le meilleur score |
| `item.chaosDesc` | 拖放到对手头像使用，或双击自动给最高分对手 | Drag onto opponent, or double-click for highest scorer | Glissez sur un adversaire, ou double-clic pour le meilleur score |
| `item.quickMatchDesc` | 双击立即消除一对 tile | Double-click to remove one pair instantly | Double-clic pour eliminer une paire instantanément |

---

## 4. 技术方案

### 4.1 前端 JSX 结构

将每个 `item-icon` 包裹在 `.item-tooltip` 容器中，内部增加 `.item-tooltip-bubble`：

```jsx
<div className="item-slot">
  <div className="item-tooltip">
    <div
      className="item-icon smoke-bomb-icon"
      draggable={...}
      onDragStart={...}
      onDoubleClick={...}
    >
      😶‍🌫️
    </div>
    <div className="item-tooltip-bubble">
      <strong>{t("item.smokeDesc")}</strong>
    </div>
  </div>
</div>
```

> 注意：移除 `title` 属性。

### 4.2 CSS 样式

```css
.item-tooltip {
  position: relative;
  display: inline-flex;
}

.item-tooltip-bubble {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  z-index: 50;
  width: max-content;
  max-width: 220px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(24, 28, 36, 0.92);
  border: 1px solid rgba(160, 180, 200, 0.2);
  color: #f0f4f8;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease, transform 0.15s ease;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

/* 小箭头 */
.item-tooltip-bubble::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 6px;
  border-style: solid;
  border-color: rgba(24, 28, 36, 0.92) transparent transparent transparent;
}

.item-tooltip:hover .item-tooltip-bubble {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```

### 4.3 最小改动方案（直接应用到现有代码）

1. `App.jsx`：每个 `item-icon` 外加一层 `<div className="item-tooltip">`，内部紧跟 `<div className="item-tooltip-bubble">...
</div>`，移除 `title`。
2. `i18n.js`：新增 3 个文案键（zh/en/fr）。
3. `styles.css`：新增 `.item-tooltip` / `.item-tooltip-bubble` / `::after` / `:hover` 规则。

---

## 5. 任务拆分

| # | 任务 | 文件 | 预估工时 |
|---|---|---|---|
| 1 | 新增 i18n 文案键 | `src/i18n.js` | 10 min |
| 2 | 包裹 item-icon + 移除 title + 添加 bubble JSX | `src/App.jsx` | 15 min |
| 3 | 新增 tooltip CSS | `src/styles.css` | 15 min |

**总计：约 40 分钟**
