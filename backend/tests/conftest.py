"""Pytest configuration – ensure the backend package directory is on sys.path
so that the bare imports used by api.py (e.g. ``from translate import …``)
resolve correctly when tests are collected from the project root."""

import sys
from pathlib import Path

# Add  …/backend  to the front of sys.path
_backend_dir = str(Path(__file__).resolve().parent.parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
