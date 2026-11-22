# Ajaia Docs

[![CI](https://github.com/Ahmed-Ousama/ajaia-task/actions/workflows/ci.yml/badge.svg)](https://github.com/Ahmed-Ousama/ajaia-task/actions/workflows/ci.yml)

Ajaia Docs is a lightweight collaborative document editor. You can create, format, import and share
documents, attach files to them, and get notified when someone shares a document with you.

**Live:** https://government-swaziland-connectors-concerns.trycloudflare.com

(Hosted on a shared VPS behind a Cloudflare tunnel. See *Deploy* below.)

## Demo accounts

All three accounts use the password **`password123`**. On the login page, click an account to fill in the form.

| User | Email | What the seed data gives them |
|---|---|---|
| Alice Admin | `alice@ajaia.test` | Owns "Welcome to Ajaia Docs" (shared with Bob as an editor). Has view-only access to Bob's "Q4 planning notes". |
| Bob Builder | `bob@ajaia.test` | Owns "Q4 planning notes". Can edit Alice's welcome doc. |
| Carol Chen | `carol@ajaia.test` | Starts with nothing, so use her to test sharing and notifications from scratch. |

Signing out also ends the Keycloak session, so switching between users works without extra steps.

### A 2-minute review path

1. Sign in as **Alice** and open *Welcome to Ajaia Docs*.
2. Edit it with the toolbar. Changes autosave; refresh to see them persist.
3. Click **Share** and add `carol@ajaia.test` with **View only**.
4. Upload a file in the **Attachments** panel, then upload the same file again to see the duplicate prompt.
5. Sign out and sign in as **Carol**:
   - The 🔔 shows "Alice shared…".
   - The doc is under **Shared with me**.
   - It opens read-only, and editing is blocked by the server, not just hidden in the UI.
6. On the dashboard, use **Import file** with a `.md` or `.docx` file to get a new editable document.
7. Open the same doc as two users in two browsers (one in a private window):
   - presence avatars show up;
   - comments from one user appear for the other;
   - **History** lists the editing sessions and lets you restore one;
   - **Export ▾** downloads a PDF or Markdown.

## Features

- **Documents:** create, rename, edit and delete.
  - Rich text: bold, italic, underline, strikethrough, headings H1–H3, bulleted and numbered lists, quote, divider, undo and redo.
  - Autosave: changes save after a short pause, with a save-status indicator and a retry if a save fails. `Ctrl/Cmd+S` saves straight away, and the browser warns before you leave with unsaved changes.
- **Sharing:**
  - The owner shares by email with **Can edit** or **View only**, and can change or remove access later.
  - The dashboard separates **My documents** from **Shared with me** and shows the access level on each.
  - All permissions are enforced on the server.
- **File upload** (types are also listed in the UI), max **5 MB** per file:
  - **Import:** `.txt`, `.md` and `.docx` files become a new editable document, and the original file is attached to it.
  - **Attachments:** `.pdf .png .jpg .jpeg .gif .webp .txt .md .csv .docx .xlsx .pptx`. Files are stored in a private MinIO bucket and can only be downloaded through the API, by people who have access to the document.
  - **Duplicate detection:** re-uploading the same file (same SHA-256, checked per user) asks for confirmation first. A confirmed copy gets a numbered name, such as `report (2).pdf`.
- **Notifications (live):** the 🔔 bell updates instantly over Server-Sent Events when someone shares a document with you, changes your access, or comments on a document you can open.
- **Comments:** anyone with access can comment, viewers included, and a comment can quote the selected text. Owners, editors and the comment's author can resolve or reopen it.
- **Version history:** a snapshot is saved automatically for each editing session. You can preview any version read-only and restore it, and a restore is itself undoable.
- **Real-time collaboration indicators** (Server-Sent Events):
  - Google Docs–style **coloured carets with name labels** show where each collaborator is typing, and their selections are highlighted in their colour.
  - Avatars show who has the document open, and they update the moment someone joins or leaves. Each avatar uses the same colour as that person's caret.
  - "Bob is editing…" appears while someone else saves.
  - Their changes show up in your editor right away if you aren't typing. If you are, a "Load latest" banner appears instead.
  - New comments appear immediately.
- **Export:** **Word (.docx)**, PDF through the browser's print dialog (only the document is printed), or Markdown (`.md`).
- **Search and filters** on the dashboard:
  - Full-text search over titles, content, owner names and attachment file names.
  - Filter by owner (me or shared with me) and by last modified (today, 7 days, 30 days), and sort the results.
  - Filters are kept in the URL, so they survive a refresh and can be shared.
- **Auth:**
  - The app has its own login page; Keycloak checks the credentials on the server side.
  - Keycloak manages the users and passwords and protects against brute-force attempts.
  - In production Keycloak isn't exposed to the internet at all.

## Run locally

You need **Docker** and **Node 22**.

```bash
cp .env.example .env              # local defaults work as-is
docker compose up -d              # Postgres, MinIO and Keycloak (Keycloak's first start takes ~30 s)
npm ci
npx prisma migrate deploy
npm run db:seed                   # demo users and sample documents
npm run dev                       # http://localhost:3100
```

| Service | Local URL |
|---|---|
| App | http://localhost:3100 |
| Keycloak admin | http://localhost:8180, user `admin` / `admin` |
| MinIO console | http://localhost:9101, user `ajaia` / `ajaia-secret-key` |

The app uses port 3100 because the Keycloak client's redirect URIs come from `APP_URL` in `.env`. Change both together if you need a different port.

## Tests

```bash
docker compose up -d db minio     # the integration tests use the real database and object storage
npm test
```

There are 40 tests:

- **Permission matrix:** what owners, editors and viewers can do.
- **Import conversion:** text, markdown and Word files, including HTML escaping.
- **API integration (real route handlers, Postgres and MinIO):**
  - sharing and access, end to end;
  - validation errors;
  - duplicate-upload detection;
  - notifications;
  - comments;
  - version history and restore;
  - presence;
  - Word export (round-tripped back through the importer);
  - search filters.

Type-check and lint with `npx tsc --noEmit` and `npm run lint`.

**End-to-end real-time check (two real browsers):** `npm run test:e2e`. You need the app running and a local Chrome; set `BASE_URL` to test a deployment. It drives Alice and Bob through the whole collaboration flow and cleans up after itself:
- both see "Live" and each other's presence;
- Bob types: Alice sees "Bob is editing…" and his text appears without a refresh;
- Bob comments: Alice sees it instantly and her 🔔 updates;
- opening the bell marks notifications read;
- Bob leaves: his avatar disappears for Alice.

## Deploy (single VPS)

```bash
# 1. One time, on a fresh Ubuntu 24.04 server: install Docker and open only ports 22, 80 and 443
ssh root@SERVER 'bash -s' < deploy/setup-server.sh

# 2. One time: generate a production .env with random secrets and copy it to the server
deploy/make-env.sh SERVER_IP > .env.prod
scp .env.prod root@SERVER:/opt/ajaia-docs/.env

# 3. Every deploy: sync the code, build, then start or restart the stack
SSH_KEY=~/.ssh/your_key deploy/deploy.sh root@SERVER
```

- **On a dedicated server:** Caddy gets a Let's Encrypt certificate for `DOMAIN` automatically. `sslip.io` hostnames mean no domain needs to be registered.
- **On a shared server whose ports 80 and 443 are taken** (the live demo):
  - Generate the env with `deploy/make-env.sh <ip> <http-port>`.
  - Start the opt-in Cloudflare tunnel with `docker compose --profile prod --profile tunnel up -d`.
  - Set `APP_URL` to the `https://….trycloudflare.com` URL it prints.
  - The stack is an isolated Compose project (`ajaia-docs`) with memory limits, so it runs alongside other workloads without touching them.
- Only the app is public. Keycloak, Postgres and MinIO stay on the internal Docker network. For the Keycloak admin console, use an SSH tunnel: `ssh -L 8180:127.0.0.1:8180 root@SERVER`.
- The app container applies migrations and seeds the demo users each time it starts.

## Project layout

```
src/app/                  pages (dashboard, editor, login) and REST route handlers under api/
src/components/           UI: editor, toolbar, share dialog, attachments, notification bell
src/lib/access.ts         permission rules (pure functions, unit-tested)
src/lib/{storage,import,duplicates,upload}.ts   S3/MinIO, file conversion, SHA-256 duplicate rules
src/auth.ts, src/lib/keycloak.ts   Auth.js + Keycloak: credential exchange, local User mapping, back-channel logout
prisma/                   schema, migrations, seed
keycloak/realm-ajaia.json realm import: client and demo users
tests/                    Vitest unit and integration tests
deploy/                   server setup and deploy scripts
```

## More

- [ARCHITECTURE.md](ARCHITECTURE.md): design decisions, tradeoffs, what I cut and what comes next.
- [AI_WORKFLOW.md](AI_WORKFLOW.md): how AI tools were used and checked.
- [SUBMISSION.md](SUBMISSION.md): what's included, what works, and what's incomplete.
