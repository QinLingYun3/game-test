## Context

项目技术栈：React 18 + Vite，无 UI 库。SPA 单页应用，`App.jsx` 为根组件。

## Decisions

1. 版本信息通过 `public/version.json` 静态文件承载，`fetch` 请求时加 `?_t=${Date.now()}` 防缓存
2. 使用 React Portal 渲染 Modal，避免 z-index 层叠问题
3. localStorage key 为 `app_version_read`，存储已读版本号
4. 请求失败时静默降级（console.warn），不阻塞渲染
5. 弹窗用 CSS animation 实现淡入淡出，无需额外依赖

## Data Model

- `public/version.json`：`{ version, publishTime, changelog: string[] }`
- localStorage：`app_version_read` → 已读版本号字符串
- Hook state：`{ show, versionInfo, loading }`

## Component Tree

```
App.jsx
  └─ useVersionCheck() → 控制 VersionModal 显示
  └─ VersionModal (Portal)
       ├─ 遮罩层
       ├─ 卡片
       │   ├─ 版本号 + 发布时间
       │   ├─ Changelog 列表
       │   └─ "我知道了" 按钮
       └─
```

## Risks

- 如果用户 localStorage 被清除，下次访问会再次弹窗，这是预期行为
- version.json 需要手动维护，每次发版都需更新
