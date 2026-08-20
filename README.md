# FPOWS — Fire Protection Operations Web System

**REDMEN Fire Protection** · simPRO Automation Platform

[![Built with Claude](https://img.shields.io/badge/Built%20with-Claude%20AI-orange?logo=anthropic)](https://anthropic.com)
[![Deployed on Cloud Run](https://img.shields.io/badge/Deployed-Google%20Cloud%20Run-blue?logo=googlecloud)](https://cloud.google.com/run)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=nodedotjs)](https://nodejs.org)

---

## What it does

FPOWS automates field operations reporting for REDMEN Fire Protection by pulling live job data from simPRO and distributing it to the team via email.

- **Live job dashboard** — search customers, view outstanding works, service dates, overdue jobs
- **Automated daily reports** — 6:00 AM email summary sent to management every day
- **Google OAuth login** — restricted to `@redadair.com.au` accounts only
- **Custom domain** — [fpows.redadair.com.au](https://fpows.redadair.com.au)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML/CSS/JS |
| AI Assistant | **Claude (Anthropic)** |
| Hosting | Google Cloud Run |
| Auth | Google OAuth 2.0 |
| Data source | simPRO API |
| Scheduler | Google Cloud Scheduler |
| Domain | Cloudflare DNS + GCP Load Balancer |

## AI

This project was built with the assistance of **Claude by Anthropic** — used for architecture decisions, feature implementation, debugging, and deployment.

## Project Structure

```
server.js     # thin entry point (build app → register cron → listen)
src/          # backend: config, services, middleware, routes, jobs
public/       # served web app (index.html, logo.png, docs.html, version.txt)
data/         # runtime data (email history, report status)
deploy/       # deployment tooling (deploy.ps1, cloud-sql-proxy)
tests/        # developer test scripts
scripts/      # one-off diagnostic / maintenance scripts
docs/         # documentation & generated artifacts (PDFs, briefs)
```

See `CLAUDE.md` for a detailed module map.

## Running Locally

**Prerequisites:** Node.js 20+ and a filled-in `.env` file. See `requirements.txt` for the full dependency reference (installed via `npm install`).

```powershell
# 1. Install dependencies (node_modules is not committed)
npm install

# 2. Create your secrets file from the template and fill it in
Copy-Item .env.example .env
#    edit .env — at minimum SIMPRO_BASE_URL and SIMPRO_ACCESS_TOKEN are required

# 3. Start the server
npm start        # → node server.js, listens on http://localhost:3000
npm run dev      # same, with --watch auto-reload for development
```

Then open **http://localhost:3000**.

> [!IMPORTANT]
> - Keep `NODE_ENV` **unset or `development`** locally. If it is `production`, the app skips loading `.env` and OAuth redirects to the live domain instead of `localhost:3000`.
> - The server **will not start** without `SIMPRO_BASE_URL` and `SIMPRO_ACCESS_TOKEN`.
> - Google login requires `http://localhost:3000/auth/callback` to be registered as an authorized redirect URI on the OAuth client. Login is restricted to `@redadair.com.au` accounts.

## Deployment

Deploys to **Google Cloud Run as a container image** (built with Docker, stored in **Artifact Registry**) via `deploy.ps1`:

```powershell
# Requires: gcloud CLI (authenticated) and a filled-in .env
.\deploy\deploy.ps1
```

**What the script does** (`deploy.ps1`):

1. Loads credentials from your local `.env` (aborts if the file or any required var is missing — `.env` is never committed).
2. Enables the required APIs (`artifactregistry`, `run`, `cloudbuild`, `cloudscheduler`) and ensures the Artifact Registry Docker repo `fpows` exists in the region.
3. **Builds the image** from the repo `Dockerfile` (Node 20), tagged with the current git short SHA (and `:latest`):
   - Uses local **Docker** (`docker build` + `docker push`) when the Docker CLI is available.
   - Falls back to **Cloud Build** (`gcloud builds submit`) when Docker isn't installed.
4. **Pushes** the image to Artifact Registry at
   `australia-southeast1-docker.pkg.dev/fpows-500123/fpows/bryan-fpows`.
5. **Deploys the image** to Cloud Run with `gcloud run deploy --image ...` (image/container deployment, **not** `--source`), passing every secret via `--set-env-vars`.
6. Fetches the service URL and creates/updates the daily 6 AM scheduler job.

**Target configuration:**

| Setting | Value |
|---------|-------|
| GCP Project | `fpows-500123` |
| Artifact Registry repo | `fpows` (Docker format, `australia-southeast1`) |
| Image | `australia-southeast1-docker.pkg.dev/fpows-500123/fpows/bryan-fpows:<git-sha>` |
| Cloud Run service | `bryan-fpows` |
| Region | `australia-southeast1` |
| Access | `--allow-unauthenticated` (app enforces its own Google OAuth) |
| Request timeout | 540s |
| Scheduler job | `fpows-daily-report-6am` — `0 6 * * *` Asia/Manila → `GET /api/trigger-manager-report?key=$ADMIN_API_KEY` |

Container: `node:20-slim`, `npm install --omit=dev`, `npm start`, listens on `$PORT` (Cloud Run injects it; defaults to 3000).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SIMPRO_BASE_URL` | simPRO instance URL |
| `SIMPRO_ACCESS_TOKEN` | simPRO API token |
| `SIMPRO_COMPANY_ID` | simPRO company ID |
| `SMTP_USER` | Email sender address |
| `SMTP_PASS` | Email app password |
| `MANAGER_EMAIL` | Report recipient |
| `ADMIN_API_KEY` | Internal API key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `SESSION_SECRET` | Express session secret |

---

*REDMEN Fire Protection — Internal Tool*
