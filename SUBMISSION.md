# Submission: Ajaia Docs

## Links
- **Live product:** https://LIVE_DOMAIN. The deployment stays up until at least **2026-12-06**.
- **Walkthrough video:** see `VIDEO_URL.txt`.

## Test accounts
All three use the password `password123`:

- `alice@ajaia.test`
- `bob@ajaia.test`
- `carol@ajaia.test`

See [README](README.md#demo-accounts) for what each account starts with and a 2-minute review path.

## What's in this folder
| Path | What it is |
|---|---|
| `README.md` | Local setup, run, test and deploy instructions; demo accounts; feature list |
| `ARCHITECTURE.md` | Architecture note: what I prioritized and why, tradeoffs, cuts, next steps |
| `AI_WORKFLOW.md` | AI workflow note: tools used, where they helped, what I changed or rejected, how I verified |
| `SUBMISSION.md` | This file |
| `VIDEO_URL.txt` | Walkthrough video link |
| `src/`, `prisma/`, `keycloak/`, `tests/` | Source code, DB schema and migrations, Keycloak realm, tests |
| `docker-compose.yml`, `Dockerfile`, `Caddyfile`, `deploy/` | Infrastructure and deployment |

`node_modules/`, `.next/` and `.env` are deliberately left out. `.env.example` documents every variable.

## What's working (end to end, deployed)
- Our own login page, backed by Keycloak: credentials are checked by Keycloak, brute-force protection is on, and sign-out also ends the Keycloak session. There are 3 seeded users, and the login page fills in a demo account with one click.
- Creating, renaming, editing and deleting documents. Rich text (bold, italic, underline, headings, lists and more) is saved and still there after a refresh, with autosave, a save-status indicator and retry.
- Sharing by email as **editor** or **viewer**: role changes, revoking access, and separate "My documents" and "Shared with me" lists. All of it is enforced on the server (non-shared users get 404, viewers get 403 on writes).
- Importing `.txt`, `.md` and `.docx` files as new documents.
- File attachments in a private MinIO bucket, with access-checked downloads.
- Per-user duplicate-upload detection (SHA-256) with a confirmation popup and numbered copies.
- Share and role-change notifications (🔔, polled every 30 s).
- **All the optional stretch items:**
  - role-based sharing;
  - comments that can quote the selected text, with resolve and reopen;
  - version history with preview and restore;
  - **real-time** presence, an "X is editing" indicator, live content sync and live comments over Server-Sent Events;
  - export to **Word (.docx)**, PDF and Markdown.
- Comment notifications plus live notification delivery.
- Dashboard **search and filters**: search by title, content, owner or attachment name; filter by owner, attachment type and date; sort.
- 40 automated tests (unit + API integration against Postgres and MinIO). Type-check and lint are clean.

## Incomplete or deliberately cut
- **No character-level co-editing (CRDT).** Other people's saves are pushed live and applied when you're idle. If two people type at the same moment, the last save wins, and the one who is mid-edit gets a "Load latest" banner.
- **The event bus is in-process.** That's fine for this single-instance deployment; scaling out needs Postgres LISTEN/NOTIFY or Redis.
- **Sharing only works with existing users.** There are no invites for unknown emails.
- **Comments aren't anchored inline**, and there's no suggestion mode.
- **No images inside the document body.** Images can be added as attachments instead.

## Next 2–4 hours
1. Real-time collaboration with Yjs and the Tiptap collaboration extension, plus presence and pushed notifications.
2. Inline comment anchors and suggestion mode.
3. Email invites for users who don't have an account yet.
4. Visual diffs between versions.
5. A Playwright end-to-end test of the multi-user share flow.
