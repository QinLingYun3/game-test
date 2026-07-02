## Why

单人模式上线后，通过实际体验发现部分 UI 文案和交互细节需要优化，以提升用户体验的直观性和友好度。

## What Changes

- 结算页面增加"返回首页"按钮，方便玩家快速回到主页
- 首页难度选择中"默认"改为"闯关"，更直观地表达该选项的含义
- 去掉"选择关卡"文字标签，仅保留下拉框，减少视觉冗余

## Capabilities

### New Capabilities
- `results-back-to-home`: 结算页面返回首页按钮
- `home-difficulty-rename`: 首页难度选项文案优化
- `home-level-select-simplify`: 首页关卡选择 UI 简化

### Modified Capabilities
<!-- 无现有 spec 需要修改 -->

## Impact

- `src/App.jsx`：结算页面按钮区域、首页难度选择区域
- `src/i18n.js`：新增和修改翻译键
- `src/styles.css`：按钮间距调整
