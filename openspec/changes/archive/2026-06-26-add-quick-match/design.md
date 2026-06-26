## Context

第三种道具"快速消除"，由系统自动消除一对 tile。消除动画与手动消除完全一致。

## Decisions

1. 只能对自己使用（双击道具图标）
2. 消除动画复用现有连线/粒子效果
3. 固定 +100 分，不参与 combo 加成
4. `removablePairs === 0` 时道具禁用

## Data Model

- 新增 `findAnyRemovablePair` 共享函数
- 新增 `use_quick_match` 消息类型
