## Why

当前道具使用 HTML 原生 `title` 属性显示提示，样式不可控且简陋。改为自定义气泡提示框。

## What Changes

- 道具图标 hover 时弹出圆角气泡，显示名称 + 使用说明
- 移除原生 `title` 属性
- 多语言文案

## Impact

- Affected code: `src/App.jsx`, `src/styles.css`, `src/i18n.js`
- 纯前端改动，不影响游戏逻辑
