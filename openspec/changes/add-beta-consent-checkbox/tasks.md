## 1. State & Storage

- [x] 1.1 新增 `betaConsent` state，从 localStorage（key `match2-beta-consent`）读取初始值
- [x] 1.2 勾选时写入 localStorage，取消勾选时清除

## 2. UI

- [x] 2.1 房号输入框下方新增复选框 + 文本
- [x] 2.2 按钮禁用条件增加 `!betaConsent`
- [x] 2.3 未勾选时点击按钮弹出 error "必须同意才能开始游戏"

## 3. i18n

- [x] 3.1 新增 `beta.consent` 文案（三种语言）
- [x] 3.2 新增 `error.betaConsentRequired` 文案
