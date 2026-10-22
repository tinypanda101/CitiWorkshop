"""
Fills the local database with the mock data (10,000 tickets and everything they need).
WARNING: it deletes everything first; it keeps admin@acme.inc and ryseney@acme.inc.

    .venv/bin/python scripts/mock_data.py

The generator itself is backend/mockdata/mock_data.py, so the same code can run on AWS too
(see scripts/load-mock-data-aws.sh).
"""

import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).resolve().parent.parent / "backend" / "mockdata" / "mock_data.py"), run_name="__main__")
