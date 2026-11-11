# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Initial digest preview

The manual **Initial marked digest preview** Actions workflow tests the service, exports
`/digest/2026-10-28` over a temporary loopback HTTP listener, and deploys one `index.html`
through a Pages artifact. Configure GitHub Pages to use Actions and supply the repository
secret `LANE_MARKER` before dispatching. The secret is available only to the export step.
The deployment environment reports the actual public URL; every dispatch replaces that
site. Artifact retention is one day; this does not remove the deployed site.

To export locally with a marker already supplied in the process environment:

```sh
pnpm exec tsx scripts/export-preview.ts /absolute/path/outside/git/new-preview-directory
```

The parent directory must exist and the output directory must be new. The command verifies
the original sample fixtures (allowing LF or CRLF), requires a nonempty marker, and uses
the sample lane ID `lane-07`. It never loads `.env` automatically or logs page content.
Keep generated HTML outside git. This workflow supports the initial marked preview only;
reviewer delivery remains a separate authorized step in issue #7.
