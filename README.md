# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Reviewed digest preview

The manual **Reviewed digest preview** Actions workflow tests the service, exports
`/digest/2026-10-28` over a temporary loopback HTTP listener, and deploys one `index.html`
through a Pages artifact. GitHub Pages uses Actions. The export step explicitly unsets
`LANE_MARKER` and requires the live page's banner to read `no marker set`; it uses no marker
secret. Every dispatch replaces the same site at <https://psadovski.github.io/rig-s01e04/>.
Artifact retention is one day; this does not remove the deployed site.

To export the reviewed page locally on POSIX:

```sh
env -u LANE_MARKER pnpm exec tsx scripts/export-preview.ts /absolute/path/outside/git/new-preview-directory --unmarked
```

On Windows PowerShell:

```powershell
Remove-Item Env:LANE_MARKER -ErrorAction SilentlyContinue
pnpm.cmd exec tsx scripts/export-preview.ts "$env:TEMP/new-preview-directory" --unmarked
```

The parent directory must exist and the output directory must be new. The command verifies
the original sample fixtures (allowing LF or CRLF) and uses the sample lane ID `lane-07`.
In `--unmarked` mode, `LANE_MARKER` must be absent: even an empty value is rejected.
The exporter never loads `.env` automatically or logs page content. Do not add `--env-file`
or use `pnpm start` for cleanup: those can reload the private marker into the process.
Keep generated HTML outside git.

Without `--unmarked`, the exporter retains its initial marked behavior for audit history:
it requires a nonempty marker supplied in the process environment. The reviewed Pages
workflow always selects `--unmarked`. Review delivery and public cleanup verification are
tracked separately in issues #7 and #8.
