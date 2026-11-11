# Digest contract

`src/digest/types.ts` is the shared contract for the reader, page, JSON route, and
board. The reader implementation belongs in `src/digest/reader.ts`, exporting
`readNight` with the synchronous callable type `ReadNight`:

```ts
type ReadNight = (runsDir: string, night: string) => DigestResult
```

This contract commit supplies types only. It does not provide a runtime reader.

## Files and records

`night` must be a real calendar date in exactly `YYYY-MM-DD` form. Invalid dates
or other names throw `RangeError` before filesystem access. Read
`<runsDir>/<night>.jsonl`; the selected night names the file, not a calendar-day
filter. Include its events after midnight.

A missing file returns `{ kind: 'missing', night }`. Other I/O errors propagate.
An existing file returns `{ kind: 'found', night, rows, malformedRecords }`, even
when empty: an empty file has `rows: []` and `malformedRecords: 0`. A file with
only malformed records is also found, with no rows and a positive count.

Each JSONL record must be an object with a valid timezone-bearing timestamp
`at`, a nonempty string `job`, `status` equal to `ok`, `retry`, or `fail`, and
`owner` either a string or null. If present, `error` must be a string. Unknown
extra fields are ignored. Malformed JSON or invalid fields count once per
record and contribute no job or event. An internal blank record is malformed;
a terminal newline creates no extra record. Accept LF and CRLF line endings.

## Aggregation and presentation

Order valid events by timestamp instant, then by original line order. For equal
instants the later line is the later event. Preserve the original timestamp
strings, including offsets, in `first` and `last`; do not convert display times
to UTC. `first` belongs to the earliest event and `last` to the latest event.

Produce one `DigestRow` per job, sorted ascending by job name with deterministic
string comparison (not environment-dependent locale ordering):

- `job`: original job name; `runs`: all valid events; `retries`: retry events.
- `status` and `owner`: from the latest event, including a null owner.
- `lastError`: the most recent nonempty error string in event order, preserving
  its text. An absent or empty error never clears an earlier error. Use null
  when no event has an actual error.
- `hasFailed`: whether any valid event has status `fail`, even after recovery.

The board counts final `status` once per job. Historical failures still mark
the digest row via `hasFailed`; retries of three or more also receive a mark.
Missing presentation values render as an em dash. Page and JSON consumers use
the same rows and ordering. The page distinguishes a missing night (404) from
an empty existing night (200, "nothing ran").

## Read-only fixture baseline

Verified against the supplied fixtures and local `aggregation-verification.md`
and `fixture-verification.json` reports in `s01e04-planning`:

| Night | Valid events | Jobs | Malformed records | Final-job ok / retry / fail |
| --- | ---: | ---: | ---: | --- |
| 2026-10-27 | 7 | 4 | 0 | 4 / 0 / 0 |
| 2026-10-28 | 15 | 5 | 1 (truncated JSON, line 16) | 4 / 0 / 1 |

For 28 October, sorted jobs are `digest/render`, `fixtures/refresh`, `lane/sync`,
`notes/backup`, and `rig/rotate-logs`. `digest/render` retains its null owner.
`fixtures/refresh` has four runs, three retries, final ok, and retained error
`upstream 503`. `lane/sync` has eight runs, one retry, final ok, and retained
error `lock held`. `notes/backup` has final fail and error `quota exceeded`.
All supplied timestamp offsets are `+01:00` and remain unchanged.

The fixtures do not exercise timestamp ties, mixed offsets, conflicting owners,
invalid fields in valid JSON, or recovery after failure. Reader and route
issues supply synthetic coverage without modifying `runs/`.
