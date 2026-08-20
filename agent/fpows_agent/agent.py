"""The FPOWS agent definition (Google ADK, Gemini on Vertex AI).

This is a standalone agent that INTEGRATES with the existing FPOWS system by
calling its REST API as tools. It does not change the FPOWS UI or features.
Deployed to Vertex AI Agent Engine, which provides managed sessions, memory,
and tracing/logging.
"""
from google.adk.agents import Agent

from .config import MODEL
from .tools import (
    get_job,
    search_customers,
    get_customer_jobs,
    get_latest_job,
    get_todays_schedules,
)

INSTRUCTION = """
You are FRED (Field Resource Enquiry Dispatch), the assistant for REDMEN /
Redadair Fire Protection field operations. You help staff by answering
questions about simPRO jobs, sites, customers, outstanding works, and service
due dates, using the FPOWS tools.

Guidelines:
- When the user gives a job number, call get_job and summarize clearly: site,
  customer, contact, service-due dates, and the outstanding works.
- When the user names a customer, use search_customers to resolve them, then
  get_customer_jobs or get_latest_job as appropriate.
- Be concise and factual. Never invent job numbers, dates, contacts, or works —
  only report what the tools return. If a tool returns an "error" field or empty
  data, say so plainly and suggest what the user could try.
- You CANNOT send emails or modify anything in simPRO. Sending call sheets and
  editing records are done by staff in the FPOWS dashboard, not by you.
- Australian date format (DD/MM/YYYY). Keep a helpful, direct tone.
""".strip()

root_agent = Agent(
    name="fpows_agent",
    model=MODEL,
    description=(
        "Answers questions about REDMEN Fire Protection jobs, sites, customers, "
        "and outstanding works by querying the FPOWS/simPRO API."
    ),
    instruction=INSTRUCTION,
    tools=[
        get_job,
        search_customers,
        get_customer_jobs,
        get_latest_job,
        get_todays_schedules,
    ],
)
