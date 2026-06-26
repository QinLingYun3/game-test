## Why

网站发布新版本后，用户没有渠道了解更新内容。需要一个版本更新弹窗，在用户首次访问新版时自动展示 changelog。

## What Changes

- 新增 `public/version.json` 版本信息文件
- 新增 `VersionModal` 弹窗组件，展示版本号、发布时间、更新列表
- 新增 `useVersionCheck` Hook，检测新版本并控制弹窗
- 集成到 `App.jsx` 根组件
- 使用 localStorage 记录已读版本，避免重复弹窗

## Impact

- Affected code: `src/App.jsx`, 新增 `src/VersionModal.jsx`, 新增 `src/useVersionCheck.js`, 新增 `public/version.json`
- 纯前端，无后端依赖
- 请求失败时静默降级，不阻塞页面
