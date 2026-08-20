# FPOWS Agent (Google ADK → Vertex AI Agent Engine)

A **standalone** conversational agent for REDMEN Fire Protection, separate from
the FPOWS web app but **integrated** with it. The agent (FRED) answers questions
about simPRO jobs, sites, customers, and outstanding works by calling the
existing FPOWS REST API as tools.

- **Framework:** Google ADK (Python)
- **Model:** Gemini (native on Vertex AI)
- **Deployment:** Vertex AI **Agent Engine** — provides managed **sessions,
  memory, and tracing/logging** (so we don't hand-roll any of that)
- **Integration:** calls FPOWS `/api/*` endpoints using a shared `AGENT_API_KEY`
  (the `x-agent-key` header) — **no changes to the FPOWS UI or features**
- **Safety:** tools are **read-only**. There is deliberately **no email/send
  tool** — sending call sheets stays a human action in the dashboard.

```
User ──chat──► Agent (ADK, Gemini)          FPOWS (unchanged)
              on Vertex Agent Engine  ──tools──►  /api/job/:id
              (sessions, logs, trace)  x-agent-key  /api/customers/search …
```

## Layout
```
agent/
  fpows_agent/
    __init__.py      # exposes root_agent
    agent.py         # the ADK agent (instruction + tools)
    tools.py         # read-only FPOWS API wrappers
    config.py        # env-driven config
  run_local.py       # minimal programmatic smoke test
  deploy_agent_engine.py  # deploy to Vertex AI Agent Engine
  requirements.txt
  .env.example
```

## Prerequisites
- Python 3.10+
- A GCP project with **Vertex AI API** enabled and a GCS staging bucket
- `gcloud auth application-default login`
- FPOWS running/reachable, with **`AGENT_API_KEY` set in the FPOWS `.env`**
  (the same value goes in this agent's `.env`)

## Setup
```bash
cd agent
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
#   (or) source .venv/bin/activate                       # macOS/Linux
pip install -r requirements.txt
cp .env.example .env      # then fill in project, bucket, FPOWS_API_BASE_URL, AGENT_API_KEY
```

## Run locally
Interactive (recommended):
```bash
adk web            # opens a local chat UI; select "fpows_agent"
# or
adk run fpows_agent
```
One-shot smoke test:
```bash
python run_local.py
```
> Tools only return data if FPOWS is reachable at `FPOWS_API_BASE_URL` and
> `AGENT_API_KEY` matches the FPOWS side. With placeholder simPRO creds the app
> runs but returns empty/errored data — the agent will report that honestly.

## Deploy to Vertex AI Agent Engine
```bash
python deploy_agent_engine.py
```
Prints the deployed `resource_name`. Sessions, conversation logs, and traces are
then managed by Agent Engine (view traces in Cloud Trace / Logging). To query
the deployed agent, use the Agent Engine SDK with that resource name.

## How it connects to FPOWS
The FPOWS `/api/*` routes are gated behind Google login for browsers. For
server-to-server access, FPOWS accepts a valid `x-agent-key` header
(`AGENT_API_KEY` in its `.env`) — see `src/middleware/auth.js`. Set the **same**
secret here so the agent's tool calls authenticate. Nothing else in FPOWS
changes.

## Optional: wire the dashboard's FRED widget to this agent
Not required. If desired later, add a thin `/api/chat` proxy in FPOWS that
forwards messages to the deployed Agent Engine and returns replies — the
existing FRED UI would call that instead of its local rule-based logic. This is
an additive backend step; it does not change the look or other features.
