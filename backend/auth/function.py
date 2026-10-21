"""
The auth service. Lambda calls `handler`; Mangum turns the Lambda event into a normal
FastAPI request.

In the Lambda zip this file sits next to router.py, schemas.py and the _shared folder,
so they are imported by their plain names.

Locally you can also run it on its own, from the backend/auth folder:
    PYTHONPATH=.. ../../.venv/bin/uvicorn function:app --port 8001
then open http://localhost:8001/docs.
"""

from fastapi import FastAPI
from mangum import Mangum

from _shared.errors import add_error_handlers
from _shared.seed import create_tables, seed
from router import router

# Runs once each time a new Lambda starts: adds any missing tables and starting data.
create_tables()
seed()

app = FastAPI(title="auth")
add_error_handlers(app)
app.include_router(router)

# api_gateway_base_path strips the /api/auth prefix that CloudFront passes in AWS.
handler = Mangum(app, api_gateway_base_path="/api/auth")
