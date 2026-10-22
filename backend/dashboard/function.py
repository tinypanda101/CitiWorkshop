"""
The dashboard service. Lambda calls `handler`; Mangum turns the Lambda event into a normal
FastAPI request. The tables are created by the auth service when it starts.

Locally you can also run it on its own, from the backend/dashboard folder:
    PYTHONPATH=.. ../../.venv/bin/uvicorn function:app --port 8005
then open http://localhost:8005/docs.
"""

from fastapi import FastAPI

from _shared.errors import add_error_handlers
from _shared.lambda_handler import lambda_handler
from router import router

app = FastAPI(title="dashboard")
add_error_handlers(app)
app.include_router(router)

# Strips the /api/dashboard prefix that CloudFront passes in AWS (see _shared/lambda_handler.py).
handler = lambda_handler(app, "/api/dashboard")
