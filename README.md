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

## Deployment

```powershell
# Copy .env.example to .env and fill in your credentials
.\deploy.ps1
```

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
