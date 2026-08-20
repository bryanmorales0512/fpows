"""Quick local smoke test of the FPOWS agent (no deployment).

For interactive local development, prefer the ADK dev UI/CLI:
    cd agent
    adk web            # opens a local chat UI, pick "fpows_agent"
    # or
    adk run fpows_agent

This script is a minimal programmatic example for a single query.
Requires: agent/.env configured and FPOWS running (or reachable) so tools work.
"""
import asyncio

from google.adk.runners import InMemoryRunner
from google.genai import types

from fpows_agent import root_agent

APP_NAME = "fpows_agent"
USER_ID = "local-dev"


async def ask(runner: InMemoryRunner, session_id: str, query: str) -> None:
    print(f"\n>>> {query}")
    content = types.Content(role="user", parts=[types.Part(text=query)])
    async for event in runner.run_async(user_id=USER_ID, session_id=session_id, new_message=content):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if getattr(part, "text", None):
                    print(part.text)


async def main() -> None:
    runner = InMemoryRunner(agent=root_agent, app_name=APP_NAME)
    session = await runner.session_service.create_session(app_name=APP_NAME, user_id=USER_ID)
    await ask(runner, session.id, "What are today's schedules?")
    await ask(runner, session.id, "Give me the latest major job.")


if __name__ == "__main__":
    asyncio.run(main())
