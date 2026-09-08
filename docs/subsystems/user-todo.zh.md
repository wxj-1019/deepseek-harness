# 用户待办

[English](user-todo.md) | 中文

用户跨会话每日待办清单的存储域所有者。一份扁平的条目集合：按天分桶与顺延都是对 `createdAt`/`completedAt` 的客户端派生。当部署设置 `modelVisible` 时，未完成条目会额外以整表替换的目录消息投影进每个 agent 的 pre-step——这是清单内容进入模型请求的唯一路径，且与消息本身一同记录。

## 服务行为

[`UserTodoService`](../../packages/todo/user-todo/src/index.ts) 持有持久集合及其远程面；包 [README](../../packages/todo/user-todo/README.zh.md) 与 [`types.ts`](../../packages/todo/user-todo/src/types.ts) 定义可调用 API 和条目词汇。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxusertodos--usertodoservice"></a>

### `ctx.userTodos` — `UserTodoService`

Storage-domain owner of the user's todo list. One flat durable set of items: day bucketing and carry-over are client-side view derivations over `createdAt`/`completedAt`, so the Host stores none of that bookkeeping.

The list is user-owned. When the deployment sets `modelVisible`, the service additionally projects the open items into each agent's pre-step as a full-replacement catalog message (the skill-catalog pattern), which is the only path where list content reaches a model request — and it is logged with the message itself, keeping the model-visible ⟺ logged rule.

```ts cordis-catalog
/**
 * Read every item in creation order; day views are derived by consumers.
 * @returns the frozen snapshot list.
 */
@Remote('list') async list(): Promise<UserTodoListResult>

/**
 * Create one item, or apply a partial update to an existing one. Unspecified
 * optional fields keep their current value; an explicit `null` clears a
 * link. Every material change emits {@link 'user-todo/changed'}.
 * @param request - target id (absent creates), desired fields, and link patches.
 * @returns the committed item or an explicit business failure.
 */
@Remote('put') async put(request: UserTodoPutRequest): Promise<UserTodoPutResult>

/**
 * Flip one item between open and done. Entering `done` stamps
 * `completedAt`; leaving clears it. A no-op flip returns the stored item
 * without emitting.
 * @param request - the addressed item and its desired state.
 * @returns the committed item or `item-not-found`.
 */
@Remote('toggle') async toggle(request: UserTodoToggleRequest): Promise<UserTodoToggleResult>

/**
 * Remove one item from the list; absence is already the requested state.
 * @param request - the addressed item.
 * @returns the stable absent postcondition.
 */
@Remote('delete') async delete(request: UserTodoDeleteRequest): Promise<UserTodoDeleteResult>
```

Source: [`packages/todo/user-todo/src/index.ts`](../../packages/todo/user-todo/src/index.ts)

<a id="user-todo-events"></a>

### `user-todo/*` events

<a id="user-todochanged--emit"></a>

#### `user-todo/changed` — emit

The user's todo list changed through any write verb (`put`, `toggle`, `delete`). Emitted after the storage domain committed the mutation; arguments are intentionally empty — consumers refetch instead of replaying item deltas. Listener failures are contained by the emitter's dispatch.

```ts cordis-catalog
/**
 * The user's todo list changed through any write verb (`put`, `toggle`,
 * `delete`). Emitted after the storage domain committed the mutation;
 * arguments are intentionally empty — consumers refetch instead of
 * replaying item deltas. Listener failures are contained by the emitter's
 * dispatch.
 * @mode emit
 */
'user-todo/changed'(): void
```

Source: [`packages/todo/user-todo/src/types.ts`](../../packages/todo/user-todo/src/types.ts)
<!-- END GENERATED cordis-surface -->
