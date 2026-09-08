# Agent Note: dsh-config backup repo for machine-local profiles

Status: implemented

English | [中文](2026-09-08-dsh-config-backup-repo.zh.md)

## Problem

Machine-local dsh state — profiles, `settings.yaml`, agent presets — is host configuration the fork's user maintains by hand, but it lives outside any repository, so a disk loss or a bad edit has no history and no recovery path. The same directory carries secrets-adjacent files (`credentials.yaml`, sessions, storages) that must never reach a remote, which rules out naive whole-directory versioning.

## Decision

Version the machine-local dsh home in the private repo `wxj-1019/dsh-config` rooted at `~/.dsh`: a whitelist `.gitignore` admits profiles, `settings.yaml`, and presets while `credentials.yaml`, sessions, storages, and `node_modules/` stay untracked. Commit and push from `~/.dsh` after any plugin/profile/settings/preset change; on the Windows host pushes need `git -c credential.https://github.com.usehttppath=false push` because the global `usehttppath` config makes the store helper miss the stored credential. The web profile's `cordis.patch.yml` carries the `web-ui-better-sidebar` dedup disable; without it `dsh web` dies at boot on a duplicate `/sidebar/api` route. The full procedure lives in `~/.dsh/README.md`.

## Alternatives considered

- Whole-directory git without a whitelist: rejected — sessions, storages, and `credentials.yaml` would be one `git add -A` away from a remote leak.
- Symlinking individual files into a repo elsewhere: rejected — partial coverage silently drops newly added profiles and presets.

## Consequences

- AGENTS.md carries a one-line pointer; this note and `~/.dsh/README.md` own the details.
- Any new machine-local profile, settings namespace, or preset must join the whitelist and be committed in the same change.
