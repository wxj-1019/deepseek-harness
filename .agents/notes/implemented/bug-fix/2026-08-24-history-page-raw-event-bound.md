# Agent Note: History pages are bounded by raw event count

Status: implemented

English | [中文](2026-08-24-history-page-raw-event-bound.zh.md)

## Problem

`session.history` paginates by message count only: a page is the raw event range covering the newest `maxMessages` append-origin messages (50 by default). The raw event count inside such a page is unbounded, and a delta-per-character provider — CJK text streams one to two characters per chunk — logs roughly a thousand chunk events per message. A long conversation on such a provider reaches a 50-message page of 57,000+ raw events (12.5 MiB of JSON). The web client ingests a page synchronously: `ConversationNodeAssembler.replaceWindow` sorts, indexes, and matches every event against every node definition on the main thread, then renders. Measured framework floor for 57,000 events is 839 ms in Node, several times that in a browser with real definitions and rendering — the transcript opens blank or the renderer freezes outright. Sessions stayed intact on disk the whole time, which made the failure look like data loss. [2026-08-04-large-history-pagination-call-stack](2026-08-04-large-history-pagination-call-stack.md) fixed the server-side crash in the same walk and explicitly left the page-size concern open; this closes it.

## Decision

`paginate` in `dsh-host-apiproxy` additionally bounds a page by `MAX_PAGE_EVENTS = 10_000` raw events. Walking backwards from the tail, when admitting the next message group would push the page past the bound, the cut lands at the newest accepted group's start instead — never inside a group. The tail-most message is always admitted even when its group alone exceeds the bound, so a page is never empty and every message stays reachable: a rejected group becomes the sole tail message of the next `beforeSeq` page. When the remaining messages all fit, behavior is unchanged (cut 0, whole window), and the message-count bound keeps its exact existing semantics. The bound is checked through `lowerBoundSeq`, a binary search over the ascending-seq window, so the walk stays O(messages · log events).

A regression test builds three delta-heavy messages — two of 5,501 raw events (11,002 together, past the bound) and one of 10,501 (past it alone) — and verifies the three resulting pages: the first two carry exactly one admitted group each with `hasMore`, the third lands the oversized group whole with the loop completing at cut 0. Verified live against the triggering session: the same request that returned 57,778 events / 12.5 MiB now returns 8,272 events / 1.8 MiB.

## Alternatives considered

- **Make the client ingest pages incrementally or off the main thread** — rejected for now: `replaceWindow` is the open/resync/gap-repair path shared with live stitching, and chunked async processing changes publication semantics for every consumer; the server-side bound fixes the failure for every client (web, SDK, subagent history) without touching it.
- **Lower `PAGE_MESSAGES` on the client** — rejected: any fixed message count is provider-dependent; a provider with heavier per-message chunks re-triggers the freeze.
- **Trim chunk events from history responses** — rejected: the client's partial-message assembly replays chunk events; dropping them corrupts in-progress turns and any consumer that rebuilds messages from provenance.

## Consequences

- Every history page is bounded by `max(cap, largest single message group)` raw events, so the client's synchronous ingest cost is bounded regardless of provider chunk density.
- Conversations with dense chunking open with fewer messages per page (~7 here) and page older history in as the user scrolls; sparse providers keep the full 50-message page.
- The wire contract is unchanged (`maxMessages`/`beforeSeq`); clients that treat `hasMore` correctly need no changes.
- Client-side incremental ingestion remains the deeper fix if pages ever need to grow beyond the bound.
