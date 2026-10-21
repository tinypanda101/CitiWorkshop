"""
The users service. Lambda calls `handler`; Mangum turns the Lambda event into a normal
FastAPI request. The tables are created by the auth service when it starts.

Locally you can also run it on its own, from the backend/users folder:
    PYTHONPATH=.. ../../.venv/bin/uvicorn function:app --port 8004
then open http://localhost:8004/docs.
"""

from fastapi import FastAPI
from mangum import Mangum

from _shared.errors import add_error_handlers
from router import router

app = FastAPI(title="users")
add_error_handlers(app)
app.include_router(router)

# api_gateway_base_path strips the /api/users prefix that CloudFront passes in AWS.
handler = Mangum(app, api_gateway_base_path="/api/users")
