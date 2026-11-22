# Architecture note

## What I optimized for

A 4-hour timebox, so I picked **one coherent slice done properly** over broad coverage:
a usable editor that never loses work, real access control enforced on the server,
real file storage, real login, and a deployment that reviewers can actually use.

## System overview

```
Browser ──HTTPS──▶ Caddy (TLS via Let's Encrypt, sslip.io hostname)
                    └─▶ app  Next.js 15 (UI + REST API) ──▶ Postgres  (documents, shares, attachment metadata, notifications)
                                                         ├─▶ MinIO     (private bucket, attachment bytes)
                                                         └─▶ Keycloak  (users and passwords; its own "keycloak" DB in the same Postgres)
```

Everything runs from one `docker-compose.yml` on one VPS. Only Caddy is exposed (80/443).
The app, Keycloak, Postgres and MinIO are reachable only inside the Docker network.

| Concern | Choice | Why |
|---|---|---|
| App | Next.js 15 App Router, TypeScript | UI and API in one deployable unit; server components read the DB directly, route handlers handle mutations. |
| Editor | Tiptap 2 (ProseMirror) + StarterKit + Underline | Gives me a schema-backed editor with the formatting I needed. That let me spend the time on persistence and sharing instead. |
| DB | Postgres + Prisma | Relational fits owner/share/attachment data, and migrations are versioned in the repo. |
| Files | MinIO via the S3 API (`@aws-sdk/client-s3`) | Real object storage instead of blobs in the DB or on local disk. Any S3-compatible service works by changing env vars. |
| Auth | Keycloak + Auth.js v5, using our own login page | Users and passwords live in Keycloak, with brute-force protection. The realm (client and demo users) is imported from `keycloak/realm-ajaia.json`, so every environment comes up the same way. See *Authentication* below. |
| Deploy | Docker Compose + Caddy on a VPS | One command brings up the whole stack. HTTPS uses `sslip.io` hostnames, so no domain is needed. |

## Authentication

- **Sign-in:**
  - The login page is part of the app, so users never see a separate identity-provider screen.
  - The form posts to a server action. The server exchanges the credentials with Keycloak (an OIDC Direct Access Grant) and then calls `userinfo` to get the identity Keycloak asserts.
  - That identity is mapped to a local `User` row by email.
- **Sessions:** Auth.js keeps the session in an encrypted JWT cookie that lasts 8 hours.
- **Sign-out:** ends the app session and also ends the Keycloak session over the back channel, using the stored refresh token.
- **Tradeoff:** with the Direct Access Grant, the app sees the password instead of Keycloak alone. This rules out Keycloak-hosted MFA and SSO, and OAuth 2.1 discourages it. For an internal tool, a seamless branded login was worth that. It also let me keep Keycloak off the public internet: browsers never call it, and only the app server does. The switch to the standard redirect flow is mostly configuration, which is why I didn't build a custom Keycloak theme instead.
- **Error handling:** wrong credentials show "Incorrect email or password". If Keycloak is down, the user sees "The sign-in service is unavailable" instead of a misleading wrong-password message.

## Data model

- `User`: a local mirror of the Keycloak identity, linked by email. The rows are upserted on login and the demo users are seeded, so you can share with someone before their first login.
- `Document`: `title`, `content` (HTML), `ownerId`, timestamps.
- `DocumentShare`: `(documentId, userId)` is unique, and `role` is `VIEWER` or `EDITOR`.
- `Attachment`: metadata only (`filename`, `mimeType`, `size`, `sha256`, `storageKey`, uploader). The bytes live in MinIO.
- `Notification`: tells a user "X shared Y with you" or "X changed your access". It records the recipient, the actor, the document, the role and `readAt`.

## Access control

All the rules are in one pure module, `src/lib/access.ts`, which is unit-tested:

| | view | edit / rename | attachments | share | delete |
|---|:-:|:-:|:-:|:-:|:-:|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ |
| editor | ✓ | ✓ | ✓ | – | – |
| viewer | ✓ | – | – | – | – |

Every API route resolves access on the server before doing anything.

- **No access gives 404, not 403**, so a document ID doesn't reveal whether the document exists.
- **Attachments inherit access from their document.**
- **Downloads go through the API.** It checks access and streams the file from the private bucket with `Content-Disposition: attachment` and `nosniff`. The bucket is never publicly readable.

## Editing and persistence

- Content is stored as the HTML Tiptap produces. When a document loads, the editor's schema normalizes it and drops anything it doesn't support. This one property is what makes imports and stored content safe to display: the editor is the only renderer, and nothing is injected with `innerHTML`.
- **Autosave:**
  - Saves start 800 ms after the user stops typing. Title and body changes are combined into one `PATCH`, and only one save runs at a time.
  - Failed saves stay queued, with a visible "Couldn't save · Retry".
  - `Ctrl/Cmd+S` saves immediately, and the browser warns before leaving the page with unsaved changes.
- **Concurrency is last-write-wins.** This is a deliberate cut: real-time co-editing (Yjs/CRDT) is the obvious next step, and I didn't want to fake it.

## File handling

1. **Import:** `.txt`, `.md` and `.docx` files become a new editable document.
   - Text: paragraphs and line breaks are kept, and HTML is escaped.
   - Markdown: converted with `marked`, with embedded raw HTML escaped.
   - Word: converted with `mammoth`.
   - The original file is also attached to the new document.
2. **Attachments:** any document can carry files (PDF, images, Office files, text, CSV) up to 5 MB each. Editors and owners can add and remove files; viewers can download them.

The same type and size rules are checked in the browser for quick feedback and enforced on the server. Caddy also caps request bodies at 6 MB.

**Duplicate uploads (per user):**

- The server computes the SHA-256 of every upload itself and never trusts a hash sent by the client.
- If the same user has already uploaded the same bytes to a document they can still open, the API returns `409 DUPLICATE_FILE` with the earlier file's name, its document and the date.
- The UI then asks: *"You've uploaded this file before. Upload a copy?"* If the user confirms, the request is re-sent with `allowDuplicate`, and the copy gets a numbered name such as `report (2).pdf`.
- This works the same way for attachments and for imports. An imported document's title is numbered too.
- The check is **deliberately per user**. A check across all users would turn the popup into an oracle for "someone else has this file".

## Notifications

- Sharing a document, or changing someone's role, creates a notification for the recipient. Re-sharing with the same role creates nothing.
- Revoking access deletes that user's notifications for the document, since the links would now lead to a 404.
- The header bell shows the unread count and the latest 20 items. Clicking one opens the document and marks it read, and there is "Mark all as read".
- The bell **polls every 30 s and when the window regains focus**. Real-time push (SSE or websockets) is on the next-steps list.

## Stretch features (all from the brief's optional list)

- **Role-based sharing (viewer/editor):** see the access-control section above.
- **Comments:**
  - These are document-level comments with an optional quote of the selected text. They are not inline anchors, which would need a ProseMirror mark that survives edits.
  - Viewers can comment, the way a Google Docs "commenter" can.
  - Resolving is allowed for the owner, editors and the comment's author. Deleting is allowed for the author and the owner.
- **Version history:**
  - Every save goes through `recordVersion`. Saves by the same author within 5 minutes fold into one version, so each version is the document at the end of one person's editing session.
  - The first save also stores the pre-edit baseline.
  - A restore runs in one transaction and always adds a new version, so it can be undone.
- **Real-time collaboration indicators (Server-Sent Events):**
  - **The channels:**
    - Each browser tab holds exactly one `EventSource` to `/api/events?doc=<id>`. It carries the user's notification channel and, on a document page, that document's channel.
    - One stream per tab keeps HTTP/1.1 browsers well under their 6-connections-per-host limit.
    - Writes publish to an in-process event bus (`src/lib/realtime.ts`): saves, restores, comments, typing pings, joins and leaves.
  - **Carets:**
    - Each editor broadcasts its selection (throttled to 120 ms) through `POST /api/documents/:id/cursor`.
    - Other people render it as a coloured caret with a name label, plus a tinted selection, using a ProseMirror decoration plugin (`RemoteCursors`).
    - Local edits remap remote positions so the carets stay on the right text.
    - Colours are derived from the user id, so a person has the same colour in every browser and their header avatar matches their caret.
  - **Presence:**
    - The SSE connection itself counts as presence: opening it marks you as here, and closing your last tab removes you immediately.
    - A slow heartbeat (15 s) is only a fallback.
  - **Content:**
    - A throttled typing ping makes "Bob is editing…" appear on the first keystroke.
    - Autosave debounces typing but never holds changes for more than 1.5 s, so text flows to other people while someone keeps typing.
    - If you have no unsaved changes, their version is applied straight into your editor and your caret is kept.
    - If you are mid-edit, you get a "Load latest" banner instead, so nobody's typing is overwritten.
  - **Why SSE and not websockets:** the traffic is one-way (server to client) and SSE works through Caddy with no extra infrastructure. Caddy skips compression and flushes immediately for SSE routes, and `Cache-Control: no-transform` stops Next.js gzip from buffering them.
  - **Scaling:** the bus is in-process, which is right for one app instance. With more instances it becomes Postgres `LISTEN/NOTIFY` or Redis pub/sub behind the same `publish`/`subscribe` API.
  - **What this isn't:** it's awareness plus fast sync, not character-level co-editing. That needs a CRDT (Yjs); see next steps.
- **Export:**
  - **Word (.docx)** is generated on the server with `html-to-docx`, with access checked first. The test reads the file back with `mammoth`, the same library the importer uses, to prove that headings, bold, italic and lists survive. Strikethrough isn't supported by the library, so struck text exports as plain text.
  - Markdown is converted in the browser with `turndown`. Underline has no Markdown syntax, so `<u>` is kept.
  - PDF uses the browser's print engine with a print stylesheet that prints only the title and body. This gives the best output quality for no server cost: no headless Chrome in the container.

## Search and filters

- Dashboard filters are URL parameters (`q`, `owner`, `type`, `modified`, `sort`). They're parsed and whitelisted in `src/lib/doc-filters.ts` (unit-tested) and turned into a Prisma `where`, which is always combined with the caller's ownership or share scope.
- Search is case-insensitive `ILIKE` over the title, the content, the owner's name and attachment file names. At larger scale it would become a Postgres full-text index (`tsvector` + GIN).

## Validation and errors

- Inputs are validated with zod: titles can't be empty and are capped at 200 characters, content is capped at 2 MB, emails are normalized, and roles are an enum.
- Route handlers share one error wrapper that maps errors to JSON `{ error }` with the right status code (400, 401, 403, 404, 413, 415, 422 or 502).
- The UI shows those messages inline.

## Tests

Run with `npm test` (Vitest):

- `tests/access.test.ts` covers the full permission matrix.
- `tests/import.test.ts` covers text and markdown conversion, HTML escaping, titles and the allow-lists.
- `tests/uploads-notifications.api.test.ts` checks duplicate uploads against real Postgres and MinIO: a duplicate returns 409, confirmed copies are numbered, and the check is scoped per user. It also checks that notifications are created on a new share or a role change but not on a no-op, that they are isolated per recipient, and that they are cleaned up when access is revoked.
- `tests/export.api.test.ts` round-trips a Word export, and `tests/doc-filters.test.ts` covers filter parsing and query building.
- `tests/comments.api.test.ts`, `tests/versions.api.test.ts` and `tests/presence.api.test.ts` cover the permissions for each stretch feature, version folding and restore, and the presence window.
- `tests/sharing.api.test.ts` is an **integration test against the real route handlers and Postgres**, with only the session mocked. It checks that unauthenticated requests are rejected and that a non-shared user gets 404. It then walks a share from viewer to editor: a viewer can read but gets 403 on edit and on share, an editor's edits are stored, and only the owner can delete. It also covers the validation errors.

## Deliberately cut

- Real-time co-editing (CRDT), inline-anchored comments and suggestion mode.
- Pending invites for emails that don't have an account yet. Sharing currently requires the user to exist, and the demo users always do.
- Images inside the document body.
- Public share links.

## Next 2–4 hours

1. Real-time collaboration: Yjs with Tiptap's collaboration extension and a small websocket server, which also brings presence cursors and lets notifications be pushed instead of polled.
2. Inline comment anchors (a ProseMirror mark) and suggestion mode.
3. Pending email invites, plus "transfer ownership".
4. Visual diffs between versions.
5. A Playwright end-to-end test of the login → share → open-as-other-user flow.
