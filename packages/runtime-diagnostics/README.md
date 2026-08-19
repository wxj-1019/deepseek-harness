# Runtime diagnostics

English | [中文](README.zh.md)

Package-level runtime diagnostics for the DeepSeek Harness: invariant registration, health assertions, and companion plugin ownership. All packages under this group expose diagnostic-only services and register through `@deepseek-ai/dsh-invariants`.

| Package | Role |
|---|---|
| [`invariants/`](invariants/README.md) | Invariant registry service: per-package ownership reservation, cross-package health assertions, and companion plugin onboarding |