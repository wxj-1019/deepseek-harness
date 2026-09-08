# 用量台账

[English](usage-ledger.md) | 中文

每会话用量累计的存储域所有者。桶（bucket）镜像提供方用量样本互斥的 input/cache-read/cache-write/output 词汇；对已计入的 (turn, step) 重复替换样本会造成重复计数，而 token-meter 依赖的回放顺序性质保证合法日志中不会出现这种情况。

## 服务行为

[`UsageLedgerService`](../../packages/session/usage-ledger/src/index.ts) 持有持久累计及其远程面；包 [README](../../packages/session/usage-ledger/README.zh.md) 与 [`types.ts`](../../packages/session/usage-ledger/src/types.ts) 定义可调用 API 和桶词汇。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxusageledger--usageledgerservice"></a>

### `ctx.usageLedger` — `UsageLedgerService`

Storage-domain owner of per-session usage accumulation. Buckets mirror the provider usage sample's disjoint input/cache-read/cache-write/output vocabulary; a replacement sample for an already-counted (turn, step) would double-count, and the replay ordering property token-meter relies on makes that a non-issue in legal logs.

```ts cordis-catalog
/**
 * Read every session's row, most recently active first.
 * @returns the frozen snapshot rows.
 */
@Remote('list') async list(): Promise<UsageLedgerListResult>
```

Source: [`packages/session/usage-ledger/src/index.ts`](../../packages/session/usage-ledger/src/index.ts)

<a id="usage-ledger-events"></a>

### `usage-ledger/*` events

<a id="usage-ledgerchanged--emit"></a>

#### `usage-ledger/changed` — emit

The usage ledger accumulated a sample (or a session's row first appeared). Emitted after the storage domain committed; arguments are intentionally empty — consumers refetch instead of replaying deltas.

```ts cordis-catalog
/**
 * The usage ledger accumulated a sample (or a session's row first
 * appeared). Emitted after the storage domain committed; arguments are
 * intentionally empty — consumers refetch instead of replaying deltas.
 * @mode emit
 */
'usage-ledger/changed'(): void
```

Source: [`packages/session/usage-ledger/src/types.ts`](../../packages/session/usage-ledger/src/types.ts)
<!-- END GENERATED cordis-surface -->
