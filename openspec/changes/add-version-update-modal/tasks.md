## 1. Version Info File

- [ ] 1.1 创建 `public/version.json`，包含 version、publishTime、changelog 字段

## 2. Hook

- [ ] 2.1 创建 `src/useVersionCheck.js`：fetch version.json，比较 localStorage 已读版本，返回 `{ show, versionInfo, dismiss }`

## 3. Modal Component

- [ ] 3.1 创建 `src/VersionModal.jsx`：React Portal 渲染遮罩 + 卡片
- [ ] 3.2 卡片包含版本号、发布时间、更新列表（带对勾图标）、关闭按钮
- [ ] 3.3 CSS 淡入淡出动画，响应式适配

## 4. Integration

- [ ] 4.1 在 `App.jsx` 中调用 `useVersionCheck`，渲染 `VersionModal`
- [ ] 4.2 请求失败时静默降级，不阻塞页面渲染
