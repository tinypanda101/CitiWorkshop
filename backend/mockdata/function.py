"""
The mockdata service: loads the mock data (mock_data.py) into the AWS database, which only the
Lambdas can reach. It deletes everything first, so it must never run from a web request.

- Web requests (through CloudFront or the function's URL) always carry `requestContext`;
  they get 403 and nothing happens.
- Invoked directly with AWS credentials (scripts/load-mock-data-aws.sh runs
  `aws lambda invoke`), there is no `requestContext`, so it runs and returns the row counts.
"""

import json

import mock_data


def handler(event, context):
    if not isinstance(event, dict) or "requestContext" in event:
        return {"statusCode": 403, "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": {"code": "forbidden", "message": "Not available over the web", "details": {}}})}
    return {"loaded": mock_data.main()}
