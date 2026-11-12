---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-11-12
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

The original plan above is preserved. These are the GitHub issues for this plan; earlier
archived plans have their own historical issue records.

| Issue | Blocked by | Worker | Implementation commit | Closed |
| --- | --- | --- | --- | --- |
| [#1 Shared digest contract](https://github.com/psadovski/rig-s01e04/issues/1) | None | Codex · gpt-6-astra · high | `74534d05baaa0d22ad7974a8809d5d4a7214bfb2` | 2026-11-11 |
| [#2 Run log reader](https://github.com/psadovski/rig-s01e04/issues/2) | #1 | Codex · gpt-6-astra · high | `49de0aaefec194e40213422545e75373edd956f5` | 2026-11-11 |
| [#3 Digest HTML page](https://github.com/psadovski/rig-s01e04/issues/3) | #1 to start; #2 to finish | Codex · gpt-6-luna · high | `d8301666f293d0529fc2dd1e1c28ebee37ef682d` | 2026-11-11 |
| [#4 Digest JSON endpoint](https://github.com/psadovski/rig-s01e04/issues/4) | #1 to start; #2 to finish | Codex · gpt-6-luna · high | `3c63d3985a5ff5b98228df10eabb444ae3d4da46` | 2026-11-11 |
| [#5 Board digest links](https://github.com/psadovski/rig-s01e04/issues/5) | #1 to start; #2 and #3 to finish | Codex · gpt-6-luna · high | `d042925f278a8e2d5addc8ce85b5cd141be11478` | 2026-11-11 |
| [#6 Digest route tests](https://github.com/psadovski/rig-s01e04/issues/6) | #1 to start; #2, #3, and #4 to finish | Codex · gpt-6-luna · high | `013c953c54c91d4f916b9abf12896c7ec2b46b9c` | 2026-11-11 |
| [#7 Preview for review](https://github.com/psadovski/rig-s01e04/issues/7) | #2–#6 and separate publication/delivery approvals | Codex · gpt-6-astra · high | `3a548651b476a33172eab310d5cf7f4bde8233ea` | 2026-11-12T17:45:53Z |
| [#8 Cleanup and archive](https://github.com/psadovski/rig-s01e04/issues/8) | #7, review received, and separate cleanup approval | Codex · gpt-6-astra · high | `3b75ce1686499822dca0f37426cad8801af9bc38` | Closure follows this archival commit; see issue |

The implementation commits and workers above match the recorded closing comments for
#1–#7. Issue #8's implementation commit adds explicit unmarked export; this separate
documentation commit archives the plan after public verification. Its closing comment
will record the archival commit once published.

## Completion and public verification

The [initial preview deployment](https://github.com/psadovski/rig-s01e04/actions/runs/43259265208)
published the marked digest. The reviewer confirmed the page was seen, completing #7.
The human then explicitly approved replacing the page at the same URL, deleting the
retained marked artifact, and archiving this plan.

The [cleanup deployment](https://github.com/psadovski/rig-s01e04/actions/runs/43273668477)
succeeded on commit `3b75ce1686499822dca0f37426cad8801af9bc38`. On 2026-11-12, an anonymous
fetch of the original [public preview](https://psadovski.github.io/rig-s01e04/) returned
HTTP 200 without a redirect. The banner read `no marker set`, and the original marker
was absent. The 2,255-byte response matched a fresh export fetched from the running
service over HTTP and differed from the reviewed original only in the banner.
Its SHA-256 was `48946555c730e8b3e8f79abb1140668a6c577d4332aa4f75efd9fa95e5d8c95f`.
Browser verification confirmed the five expected jobs and no scripts.

The retained marked artifact `13962427866` was deleted; the initial deployment run then
listed zero artifacts. The remaining Pages artifact `13967764653` contains the unmarked
replacement. The workflow now explicitly unsets `LANE_MARKER` and no longer reads the
marker secret. The approved cleanup keeps the same hostname and path.

Implementation verification passed all 64 tests and TypeScript checks. The exporter tests
verify unchanged fixtures and prove that marked and unmarked live exports differ only
in their banner. Archiving changes documentation only; the original `runs/` fixtures
remain unchanged.

The morning digest plan is complete. Course acceptance and the debrief remain pending
separate approval for the next claim and the resulting course/reviewer instructions.
The repository and preview answers for that claim remain unchanged.
