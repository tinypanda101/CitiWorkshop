"""
The tickets service. Lambda calls `handler`; Mangum turns the Lambda event into a normal
FastAPI request. The tables are created by the auth service when it starts.

Locally you can also run it on its own, from the backend/tickets folder:
    PYTHONPATH=.. ../../.venv/bin/uvicorn function:app --port 8003
then open http://localhost:8003/docs.
"""

from fastapi import FastAPI

from _shared.errors import add_error_handlers
from _shared.lambda_handler import lambda_handler
from router import router

app = FastAPI(title="tickets")
add_error_handlers(app)
app.include_router(router)

# Strips the /api/tickets prefix that CloudFront passes in AWS (see _shared/lambda_handler.py).
handler = lambda_handler(app, "/api/tickets")
