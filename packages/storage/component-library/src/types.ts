/**
 * Public record, request, and result vocabulary for the component library.
 * Types only, plus the seam's Cordis event declaration, so generated Remote
 * clients consume it without importing Host runtime code.
 * @module @deepseek-ai/dsh-component-library/types
 */

/** Where one learned component record came from. */
export type ComponentOrigin = 'scanned' | 'model'

/** One statically extracted (or model-reported) prop of a learned component. */
export interface ComponentProp {
  /** Prop member name. */
  readonly name: string
  /** Rendered type text as written in the source (never evaluated). */
  readonly type: string
  /** Whether the props type marks the member required. */
  readonly required: boolean
}

/** One durable component record, keyed by {@link ComponentRecord.id}. */
export interface ComponentRecord {
  /** Stable identity: `<package directory>/<component name>` (e.g. `ui-usage/UsageSection`). */
  readonly id: string
  /** npm package name owning the component. */
  readonly pkg: string
  /** Exported component name. */
  readonly name: string
  /** Repository-relative source path of the `.tsx` file. */
  readonly path: string
  /** Props resolved from the component's props type. */
  readonly props: readonly ComponentProp[]
  /** `--dsw-*` design tokens referenced by the sibling CSS module. */
  readonly tokens: readonly string[]
  /** Leading JSDoc summary of the component, when written. */
  readonly jsdoc: string
  /** Short usage snippet (nearest spec mount call, else the JSDoc `@example` block). */
  readonly example: string
  /** Who contributed the record. */
  readonly origin: ComponentOrigin
  /** False when the props type was too dynamic to resolve into members. */
  readonly propsInferred: boolean
  /** Raw props type text kept when {@link ComponentRecord.propsInferred} is false. */
  readonly rawProps: string
  /** Human confirmation flag; scanned records are born reviewed, model records are not. */
  readonly reviewed: boolean
  /** Last write time in Unix epoch milliseconds. */
  readonly updatedAt: number
}

/** One design-token inventory entry parsed from the theme stylesheet. */
export interface StyleToken {
  /** Custom property name (e.g. `--dsw-alias-label-primary`). */
  readonly name: string
  /** Declared value text. */
  readonly value: string
  /** Token tier derived from the `--dsw-<tier>-` name segment. */
  readonly tier: 'static' | 'alias' | 'specific'
}

/** One query match as presented to the model and the panel. */
export interface ComponentMatch {
  /** Exported component name. */
  readonly name: string
  /** npm package name owning the component. */
  readonly pkg: string
  /** Repository-relative source path. */
  readonly path: string
  /** Props resolved from the component's props type. */
  readonly props: readonly ComponentProp[]
  /** `--dsw-*` design tokens referenced by the sibling CSS module. */
  readonly tokens: readonly string[]
  /** Usage snippet, when known. */
  readonly example: string
  /** Who contributed the record. */
  readonly origin: ComponentOrigin
}

/** Query the library by free text with an optional package filter. */
export interface ComponentLibraryQueryRequest {
  /** Free text: component name, package name, or purpose keyword. */
  readonly query: string
  /** Restrict matches to one npm package name. */
  readonly pkg?: string
  /** Maximum matches to return; the service applies its default when absent. */
  readonly limit?: number
}

/** Successful query payload. */
export interface ComponentLibraryQueryValue {
  /** Ranked matches, best first. */
  readonly matches: readonly ComponentMatch[]
}

/** Result returned by the `query` operation. */
export type ComponentLibraryQueryResult = {
  readonly ok: true
  readonly value: ComponentLibraryQueryValue
}

/** One library summary for the panel header. */
export interface ComponentLibrarySummaryValue {
  /** Total durable records. */
  readonly total: number
  /** Records contributed by the scanner. */
  readonly scanned: number
  /** Model-contributed records still awaiting human review. */
  readonly pendingReview: number
}

/** Result returned by the `summary` operation. */
export type ComponentLibrarySummaryResult = {
  readonly ok: true
  readonly value: ComponentLibrarySummaryValue
}

/** List every record, most recently updated first. */
export type ComponentLibraryListResult = {
  readonly ok: true
  readonly value: { readonly items: readonly ComponentRecord[] }
}

/** Model contribution accepted for quarantined review. */
export interface ComponentLibraryRecordValue {
  /** Stable postcondition. */
  readonly done: true
  /** The stored record id. */
  readonly id: string
}

/** Write one model-contributed record. */
export interface ComponentLibraryRecordRequest {
  /** Exported component name. */
  readonly name: string
  /** npm package name owning the component. */
  readonly pkg: string
  /** Repository-relative source path. */
  readonly path: string
  /** Props the model claims the component takes. */
  readonly props?: readonly ComponentProp[]
  /** `--dsw-*` tokens the component's styles reference. */
  readonly tokens?: readonly string[]
  /** One-line purpose summary. */
  readonly jsdoc?: string
  /** Short usage snippet. */
  readonly example?: string
}

/** Result returned by the `record` operation. */
export type ComponentLibraryRecordResult =
  | { readonly ok: true; readonly value: ComponentLibraryRecordValue }
  | { readonly ok: false; readonly error: { readonly code: 'invalid-record'; readonly detail: string } }

/** Confirm or drop one model-contributed record from the panel. */
export interface ComponentLibraryReviewRequest {
  /** The record to review. */
  readonly id: string
  /** `approve` marks the record reviewed; `discard` deletes it. */
  readonly decision: 'approve' | 'discard'
}

/** Result returned by the `review` operation. */
export type ComponentLibraryReviewResult =
  | { readonly ok: true; readonly value: { readonly done: true } }
  | { readonly ok: false; readonly error: { readonly code: 'component-not-found'; readonly id: string } }

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * The component library gained, changed, or dropped a record through the
     * scanner, the watcher, the model tool, or a panel review. Emitted after
     * the storage domain committed; arguments are intentionally empty —
     * consumers refetch instead of replaying deltas.
     * @mode emit
     */
    'component-library/changed'(): void
  }
}
