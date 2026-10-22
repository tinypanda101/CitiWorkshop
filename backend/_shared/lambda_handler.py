"""
Turns a service's FastAPI app into the `handler` Lambda calls, using Mangum.

Mangum strips the /api/<service> prefix that CloudFront passes on. On AWS a request for the
service's root (/api/tickets/) arrives without its trailing slash, so after stripping the path
is empty, and FastAPI would answer with a redirect to "/" on the Lambda's own address (which the
browser can't use). EmptyPathIsRoot treats an empty path as "/" instead.
"""

from mangum import Mangum


class EmptyPathIsRoot:
    """ASGI wrapper: a request whose path is empty is passed on as a request for "/"."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"] == "":
            scope = {**scope, "path": "/"}
        await self.app(scope, receive, send)


def lambda_handler(app, base_path):
    """The Lambda handler for `app`, served under base_path, e.g. "/api/tickets"."""
    return Mangum(EmptyPathIsRoot(app), api_gateway_base_path=base_path)
