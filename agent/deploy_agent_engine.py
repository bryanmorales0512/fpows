"""Deploy the FPOWS agent to Vertex AI Agent Engine.

Agent Engine provides managed Sessions, Memory, and tracing/logging — so we do
not hand-roll session storage or conversation logs.

Prereqs (see agent/README.md):
  - gcloud auth application-default login
  - a GCS staging bucket
  - agent/.env filled in (GOOGLE_CLOUD_PROJECT, STAGING_BUCKET, FPOWS_API_BASE_URL, AGENT_API_KEY)

Run:  python deploy_agent_engine.py
"""
import os

import vertexai
from dotenv import load_dotenv
from vertexai import agent_engines
from vertexai.preview import reasoning_engines

from fpows_agent import root_agent

load_dotenv()

PROJECT = os.environ["GOOGLE_CLOUD_PROJECT"]
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
STAGING_BUCKET = os.environ["STAGING_BUCKET"]  # e.g. gs://my-bucket

vertexai.init(project=PROJECT, location=LOCATION, staging_bucket=STAGING_BUCKET)

# Wrap the ADK agent as an Agent Engine app (tracing -> Cloud Trace/Logging).
app = reasoning_engines.AdkApp(agent=root_agent, enable_tracing=True)

remote_app = agent_engines.create(
    agent_engine=app,
    display_name="fpows-agent",
    requirements=[
        "google-cloud-aiplatform[adk,agent_engines]",
        "requests",
        "python-dotenv",
    ],
    extra_packages=["fpows_agent"],
    # These env vars travel with the deployed agent so its tools can reach FPOWS.
    env_vars={
        "FPOWS_API_BASE_URL": os.environ.get("FPOWS_API_BASE_URL", ""),
        "AGENT_API_KEY": os.environ.get("AGENT_API_KEY", ""),
        "AGENT_MODEL": os.environ.get("AGENT_MODEL", "gemini-2.5-flash"),
    },
)

print("Deployed Agent Engine resource name:")
print(f"  {remote_app.resource_name}")
