"""Configuration for the FPOWS ADK agent (env-driven)."""
import os

from dotenv import load_dotenv

load_dotenv()

# Base URL of the running FPOWS API (the existing Node/Express app).
#   local dev:   http://localhost:3000
#   production:  https://fpows.redadair.com.au
FPOWS_API_BASE_URL = os.environ.get("FPOWS_API_BASE_URL", "http://localhost:3000").rstrip("/")

# Shared secret sent as the "x-agent-key" header so FPOWS authenticates the
# agent without a browser Google session. Must match AGENT_API_KEY in FPOWS .env.
AGENT_API_KEY = os.environ.get("AGENT_API_KEY", "")

# Gemini model served natively by Vertex AI. Configurable; keep in sync with
# what your project has access to.
MODEL = os.environ.get("AGENT_MODEL", "gemini-2.5-flash")

# HTTP timeout (seconds) for calls to the FPOWS API.
REQUEST_TIMEOUT = int(os.environ.get("FPOWS_TIMEOUT", "20"))
