"""FPOWS tools exposed to the agent.

Each function is a read-only wrapper around an existing FPOWS REST endpoint.
ADK turns these plain functions into tools using their type hints + docstrings,
so keep the docstrings accurate — the model reads them to decide when to call.

Note: there is deliberately NO email/send tool. The agent must never send email
to clients; sending stays a human action in the dashboard.
"""
from typing import Optional

import requests

from .config import FPOWS_API_BASE_URL, AGENT_API_KEY, REQUEST_TIMEOUT


def _headers() -> dict:
    headers = {"Accept": "application/json"}
    if AGENT_API_KEY:
        headers["x-agent-key"] = AGENT_API_KEY
    return headers


def _get(path: str, params: Optional[dict] = None) -> dict:
    """GET a FPOWS endpoint and return parsed JSON, or an {'error': ...} dict."""
    url = f"{FPOWS_API_BASE_URL}{path}"
    try:
        resp = requests.get(url, headers=_headers(), params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as exc:
        return {"error": f"FPOWS returned {exc.response.status_code} for {path}"}
    except requests.RequestException as exc:
        return {"error": f"Could not reach FPOWS: {exc}"}


def get_job(job_id: int) -> dict:
    """Fetch the full FPOW dossier for a simPRO job by its numeric ID.

    Returns site, customer, contact, service due dates, and the list of
    outstanding works (Pending / In-Progress). Use this when the user gives a
    job number or asks about a specific job.
    """
    return _get(f"/api/job/{int(job_id)}")


def search_customers(query: str) -> dict:
    """Search active customers by name or postcode (min 2 characters).

    Returns a list of matching customers with id, name, type, priority flag,
    and their latest job id. Use this to resolve a customer the user names.
    """
    return _get("/api/customers/search", params={"q": query})


def get_customer_jobs(customer_id: str) -> dict:
    """List recent jobs (Pending/Progress/Completed/Invoiced) for a customer id."""
    return _get(f"/api/customers/{customer_id}/jobs")


def get_latest_job(category: Optional[str] = None, customer: Optional[str] = None) -> dict:
    """Get the most recently active job.

    Optionally filter by category ("major" or "regular") or by a customer name.
    Use this when the user asks for "the latest job" or "the newest job for X".
    """
    params = {}
    if category:
        params["category"] = category
    if customer:
        params["customer"] = customer
    return _get("/api/latest-job", params=params or None)


def get_todays_schedules() -> dict:
    """Return today's job schedule snapshot from simPRO (job id, client, date)."""
    return _get("/api/schedules/today")
