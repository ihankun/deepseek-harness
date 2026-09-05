# Agent Note: Format migration accepts the released flat replay-state envelope

Status: implemented

English | [中文](2026-09-05-flat-replay-state-migration.zh.md)

## Problem

Releases before the ReplayEnvelope split (7e95a00c8a) persisted the finish chunk's `replayState` as the flat discriminated adapter envelope: `kind`, `version`, and adapter-private members. The v0→v1 migrator validated `replayState` strictly against the split `{response, blocks}` shape, so observe refused every session artifact those releases wrote ("replayState has unexpected member \"kind\"") even though the live read side degrades flat state to provider-neutral content by design.

## Decision

`replayEnvelopeValue` accepts both released shapes. The split envelope keeps its exact `{response, blocks}` contract. The flat form is admitted by its discriminators — `kind` a non-empty string, `version` an integer, and `blocks` an array when present — while every other member stays adapter-private: unvalidated and passed through untouched. The v1→v2 migrator reuses `assertReleasedPayloadSemantics`, so one change admits the form across the chain, and stream reassembly keeps the stored state byte-identical.

Interpretation stays where it already lived: `toPiAssistant` degrades unusable replay state to provider-neutral reconstruction, so migrated assistant messages render from durable content without native replay.

## Alternatives considered

**Keep refusing.** Sessions those same releases wrote would stay unloadable, and the refusal path offers no recovery because the source artifact is intentionally left unchanged.

**Map the flat form into the split envelope at migration time.** Rejected: the harness treats replay state as adapter-private and does not own its members, so translating during migration would fabricate adapter metadata semantics.

## Consequences

Artifacts from the flat era load, and their assistant messages replay through provider-neutral conversion rather than native replay. The migrator admits two `replayState` shapes; a future format version must keep replay state opaque or extend this validator deliberately.
