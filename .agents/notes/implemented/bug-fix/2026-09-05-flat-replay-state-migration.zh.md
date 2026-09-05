# Agent Note: 格式迁移接受已发布的扁平 replay-state 信封

Status: implemented

[English](2026-09-05-flat-replay-state-migration.md) | 中文

## Problem

在 ReplayEnvelope 拆分(7e95a00c8a)之前发布的版本,把 finish chunk 的 `replayState` 持久化为扁平的可判别 adapter 信封:`kind`、`version` 加 adapter 私有成员。v0→v1 迁移器按拆分后的 `{response, blocks}` 形状严格校验 `replayState`,因此 observe 拒收那些版本写出的所有会话工件("replayState has unexpected member \"kind\"")——尽管运行时读侧本就按设计把扁平状态降级为 provider-neutral 内容。

## Decision

`replayEnvelopeValue` 同时接受两种已发布形状。拆分后的信封保持精确的 `{response, blocks}` 契约。扁平形式按判别成员准入——`kind` 为非空字符串、`version` 为整数、`blocks` 存在时为数组——其余成员一律视为 adapter 私有:不校验、原样透传。v1→v2 迁移器复用 `assertReleasedPayloadSemantics`,因此一处改动即贯通整条迁移链,且流重组保持存储状态逐字节一致。

解释职责仍在原处:`toPiAssistant` 把不可用的回放状态降级为 provider-neutral 重建,迁移后的 assistant 消息由持久内容渲染,不走原生回放。

## Alternatives considered

**继续拒收。** 那些版本自己写出的会话将永远无法加载,而拒收路径没有恢复手段——源工件按设计保持不变。

**在迁移时把扁平形式映射为拆分信封。** 拒绝:仓库将回放状态视为 adapter 私有,不拥有其成员语义,迁移期翻译等于捏造 adapter 元数据语义。

## Consequences

扁平时代的工件可以加载,其 assistant 消息经 provider-neutral 转换回放,而非原生回放。迁移器接受两种 `replayState` 形状;未来的格式版本必须继续把回放状态视为不透明,或有意扩展此校验器。
