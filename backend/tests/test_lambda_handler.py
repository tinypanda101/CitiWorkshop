"""
The Lambda entry point (_shared/lambda_handler.py): requests arrive the way AWS sends them
through CloudFront and a function URL, with the /api/<service> prefix still on.
"""

import json

import pytest

from conftest import api, auth, make_user
from _shared.lambda_handler import lambda_handler


class FakeContext:
    def get_remaining_time_in_millis(self):
        return 30_000


def lambda_event(path, token=None, query=""):
    """What a Lambda function URL receives (payload format 2.0)."""
    headers = {"host": "abc123.lambda-url.us-east-2.on.aws", "x-forwarded-proto": "https"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    return {"version": "2.0", "rawPath": path, "rawQueryString": query, "headers": headers, "isBase64Encoded": False,
            "requestContext": {"http": {"method": "GET", "path": path, "sourceIp": "1.2.3.4"},
                               "accountId": "x", "apiId": "x", "domainName": "abc123", "requestId": "1", "stage": "$default"}}


@pytest.mark.parametrize("path", ["/api/tickets/", "/api/tickets"])
def test_the_services_root_works_with_or_without_the_trailing_slash(db, path):
    # AWS drops the trailing slash; that used to give a redirect to the Lambda's own address.
    handler = lambda_handler(api("tickets").app, "/api/tickets")
    token = auth(make_user(db, "admin", name="Ada Admin"))["Authorization"].removeprefix("Bearer ")
    reply = handler(lambda_event(path, token, query="per_page=1"), FakeContext())
    assert reply["statusCode"] == 200
    assert json.loads(reply["body"])["total"] == 0


def test_other_routes_still_get_their_path(db):
    handler = lambda_handler(api("facilities").app, "/api/facilities")
    token = auth(make_user(db))["Authorization"].removeprefix("Bearer ")
    reply = handler(lambda_event("/api/facilities/categories", token), FakeContext())
    assert reply["statusCode"] == 200
    assert len(json.loads(reply["body"])) == 8
