## Context

道具 hover 时弹出自定义圆角气泡提示框，替代原生 HTML `title` 属性。

## Decisions

1. 纯 CSS 实现，无 JavaScript 逻辑
2. 延迟 0.2s 出现，鼠标离开立即消失
3. 深色半透明背景 + 圆角 12px + 小箭头

## Data Model

- 新增 `item.smokeDesc` / `item.chaosDesc` / `item.quickMatchDesc` 多语言文案
