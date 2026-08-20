# Composer image upload entry on the Web surface

Date: 2026-08-19
Area: `packages/client/ui-conversation`

English | [中文](2026-08-19-composer-image-upload-entry.zh.md)

## Decision

The composer gained a visible "upload image" (zh: 上传图片) button next to the
commands trigger. The Web image-intake pipeline — the projected
`imageLimits` pre-check, the later rail thumbnails, and the host admission —
already existed and worked; it was reachable only through whole-page
drag-and-drop and clipboard paste, with no discoverable file-picker entry, so
"attach an image" was effectively invisible (`InputBar` listed only 命令 /
access / model / send controls). The button opens a hidden
`<input type="file" accept="image/*" multiple>` whose chosen files ride the
exact `intakeImages` path the drag and paste handlers use, so every gesture
shares one admission policy: a batch that breaks a projected limit is
refused whole with the same product copy, and the input value resets after
each pick so re-selecting the same file re-fires change. The button disables
while the composer is locked, busy, or composed without an attachment
service face (`addImages === undefined`), mirroring the drop gate.

No host or routing change: attaching an image in a session whose model is
text-only already reroutes to the `vision-model` scheme through
`dsh-llm-vision-route`, which the live deployment exercises — a deepseek
session that receives an image turns on `qwen3-vl-plus` for the analysis and
stays there (session-persistent routing, documented in the
[2026-08-17-vision-model-routing note](2026-08-17-vision-model-routing.md)).

While diagnosing, the committed `vision-route.e2e` settings golden was found
stale on master: it predated the better-sidebar "Side card" settings nav and
failed replay. The golden was refreshed (one added nav line) and now replays
clean.

## Consequences

- The upload button is one more affordance over the shared intake: it opens
  a file picker, and drop/paste/click all converge on `intakeImages`, so
  limit behavior and error copy cannot diverge by entry.
- Coverage: the ButtonBar spec gains click-to-open, chosen-files-through-
  intake, and both disable arms (locked / no attachment face); a new
  keyless `apps/web/tests/composer-attach.e2e.ts` scenario uploads a PNG
  through the button's file input and pins the rail thumbnail golden with
  zero model calls.
- The refresh of the stale vision-route settings golden is a separate
  correction; both ride the same commit so CI replay passes on master.
