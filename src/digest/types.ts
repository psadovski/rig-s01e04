/** Shared reader and presentation contract; see docs/digest-contract.md. */
export type DigestStatus = 'ok' | 'retry' | 'fail'

export type DigestRow = {
  job: string
  /** Owner of the latest event, including null. */
  owner: string | null
  runs: number
  retries: number
  /** Final event status; used for the board's per-job counts. */
  status: DigestStatus
  /** Most recent nonempty error, retained through subsequent successes. */
  lastError: string | null
  /** Original timestamp strings, preserving their offsets. */
  first: string
  last: string
  /** True if any valid event failed, even if the job later recovered. */
  hasFailed: boolean
}

export type DigestResult =
  | {
      kind: 'found'
      night: string
      rows: DigestRow[]
      malformedRecords: number
    }
  | { kind: 'missing'; night: string }

/**
 * Synchronous API implemented as readNight in src/digest/reader.ts.
 * Invalid night names throw RangeError; unexpected filesystem errors propagate.
 */
export type ReadNight = (runsDir: string, night: string) => DigestResult
