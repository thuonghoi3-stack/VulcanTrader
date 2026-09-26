#!/usr/bin/env python3
"""
VulcanTrader — Main entry point for webserver and FastAPI application.

This module serves two purposes:
  1. Provides the FastAPI application object for deployment platforms
     (Vercel, Heroku, AWS Lambda, etc.)
  2. Acts as a thin CLI wrapper for `python -m VulcanTrader.bot webserver`

Usage:
  - Direct: python main.py (starts webserver with optional autostart)
  - Module: python -m VulcanTrader.bot webserver
  - Vercel: automatically imports and uses the `app` object below
"""

import sys
from pathlib import Path

# Add repo root to path for clean imports
REPO_ROOT = Path(__file__).resolve().parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def create_app():
    """Create and return the FastAPI application."""
    from VulcanTrader.web_portal import WebPortal

    # In standalone mode: bot=None means the portal runs in viewer mode
    # and only serves backtest results and manages the config/bot fleet.
    portal = WebPortal(bot=None)
    return portal.app


# Export for Vercel and other ASGI platforms
app = create_app()


def main() -> None:
    """CLI entry point: start the webserver."""
    # Equivalent to: python -m VulcanTrader.bot webserver
    from VulcanTrader.bot import main as bot_main

    # Pass 'webserver' as if it were a CLI argument
    sys.argv = [sys.argv[0], "webserver"]
    bot_main()


if __name__ == "__main__":
    main()
