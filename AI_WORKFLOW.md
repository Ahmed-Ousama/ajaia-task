# AI workflow note

## Tools

- **Claude Code** (Claude Opus 5.5) in VS Code. This was my main pair-programmer: it read the brief with me, proposed the scope and plan, scaffolded the project, and wrote most of the first-draft code and tests.
- I used **background sub-agents** for separable work, with a clear contract and file ownership for each:
  - the Keycloak and Auth.js integration;
  - comments;
  - version history.
- Each agent had to pass `tsc`, ESLint and its own integration tests before I integrated its work. I wrote the shared pieces myself first: schema, migrations, `recordVersion` and the editor extension list. That way the agents built against a fixed contract instead of guessing.

## Where AI materially sped things up

- **Boilerplate at volume:** Prisma schema, REST route handlers, zod validation, the Tailwind UI, the Dockerfile and Compose file, and the Keycloak realm JSON. This is hours of typing that I could review in minutes.
- **Parallel work:** the auth integration ran in the background while the core features were being built.
- **Up-to-date checks I would otherwise have looked up by hand:** current VPS pricing, and whether MinIO images were still published (they aren't, see below).

## What I changed or rejected

| AI suggestion | What I did and why |
|---|---|
| Deploy on Vercel + Neon and skip file storage | **Rejected.** I wanted real object storage (MinIO) and a stack I control, so I chose a VPS with Docker Compose. |
| Simple seeded login with a "real auth" note for later | **Rejected.** I chose Keycloak (OIDC). Access control is central to this product, so I wanted real identities and sessions, not a mocked login. |
| A 2 GB DigitalOcean droplet to keep costs down | **Rejected** as underpowered for Keycloak, Postgres, MinIO and the Next.js build. I picked a 4 vCPU / 8 GB server. |
| Building ahead while scope decisions were still open | **Stopped it.** I made it settle each decision with me first, then build. |
| Re-theming Keycloak's hosted login page to match the app | **Redirected.** I wanted our own clean login page in the app, with Keycloak checking credentials behind it. That also let Keycloak stay off the public internet. I accepted the Direct Access Grant tradeoff knowingly; it's documented in ARCHITECTURE.md. |
| (My additions to scope) | I specified **per-user SHA-256 duplicate detection** with a confirmation popup and numbered copies, and **share notifications**. I chose the per-user scope on purpose, so the duplicate check can never reveal other users' files. |

## Problems caught during verification

- **Markdown import:** a code comment claimed raw HTML in markdown was escaped, but `marked` passes it through by default. I fixed it with a custom renderer and added a regression test (`<img onerror>` must come out escaped).
- **A wrong AI-written test:** it expected 403 when a user with no access tries to share, but the API correctly returns 404 so it doesn't leak that the document exists. I fixed the test, not the code, and added the real 403 case (a viewer trying to share).
- **MinIO images:** the official `minio/minio` images are no longer pullable. I checked this with `docker manifest inspect`, switched to the maintained `pgsty/minio` build, and pinned an exact release.
- **Smoke-testing the running app** caught something the tests didn't: after the schema changes, the dev server's cached Prisma client was stale and the new endpoints returned 500. Restarting fixed it. Production containers always start fresh, but this is why I don't treat "tests pass" as "it works".
- **Autosave vs. restore race:** a sub-agent flagged that a queued autosave could overwrite a just-restored version. I clear the save queue whenever server content replaces the editor's content.
- **Destructive commands:** Prisma's guard blocked an AI-initiated `migrate reset`. Instead of forcing it, I recreated the migration history and added a normal follow-up migration, so no data was wiped.

## How I verified correctness, UX and reliability

- **Automated:** `npm test` runs 20 tests, including an integration test against the real route handlers and Postgres for the whole sharing and permissions flow. `tsc --noEmit` and ESLint are clean.
- **Manual end-to-end** on the deployed build with the three demo users:
  - create, format, rename, refresh;
  - import `.md` and `.docx` files;
  - attach and download files;
  - share as viewer, then as editor, and confirm the view-only UI and the server-side 403s;
  - check that unshared documents return 404.
- **Security-relevant code I read line by line:** the access checks in every route, the download headers, and the upload size and type limits.
