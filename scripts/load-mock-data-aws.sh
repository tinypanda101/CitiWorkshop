#!/usr/bin/env bash
# Loads the mock data into the AWS database by running the mockdata Lambda once.
# WARNING: like scripts/mock_data.py it deletes everything first (keeps admin@acme.inc and
# ryseney@acme.inc). Deploy first: ./bin/deploy-backend.sh
#
#     ./scripts/load-mock-data-aws.sh
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
# The temporary AWS credentials and PARTICIPANT_ID, written by bin/setup-participant.sh.
source "$PROJECT_ROOT/ENVIRONMENT.config"
export AWS_REGION=${AWS_REGION:-us-east-1}

FUNCTION="coding-workshop-mockdata-$PARTICIPANT_ID"
RESULT="$(mktemp)"
echo "Running $FUNCTION (about a minute)..."
# The command succeeds even when the function fails, so check its FunctionError ("None" = it worked).
FAILED=$(aws lambda invoke --function-name "$FUNCTION" --cli-read-timeout 310 --payload '{}' \
    --query FunctionError --output text "$RESULT")
cat "$RESULT"; echo
rm -f "$RESULT"
if [ "$FAILED" != "None" ]; then
    echo "ERROR: the mockdata function failed ($FAILED). See its logs:"
    echo "  aws logs tail /aws/lambda/$FUNCTION --since 10m"
    exit 1
fi
echo "Mock data loaded."
