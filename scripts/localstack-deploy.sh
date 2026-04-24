#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
SERVER_DIR="$DIST_DIR/server"
PUBLIC_DIR="$DIST_DIR/public"
AWS_DIST_DIR="$DIST_DIR/deploy/aws"
MANIFEST_PATH="$AWS_DIST_DIR/manifest.json"
TMP_DIR="$ROOT_DIR/tmp/localstack"
LAMBDA_ZIP="$TMP_DIR/matcha-lambda.zip"
CF_DISTRIBUTION_CONFIG_PATH="$TMP_DIR/cloudfront-distribution.json"
BUCKET_NAME="${MATCHA_LOCALSTACK_BUCKET:-matcha-public}"
FUNCTION_NAME="${MATCHA_LOCALSTACK_FUNCTION:-matcha-ssr}"
FUNCTION_URL_SUBDOMAIN="${MATCHA_LOCALSTACK_FUNCTION_URL_ID:-matcha-ssr}"
REGION="${AWS_REGION:-us-east-1}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command npm
require_command zip
require_command node
require_command awslocal
require_command python3

mkdir -p "$TMP_DIR"

echo "[localstack] Building app..."
(cd "$ROOT_DIR" && npm run build)

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "Missing build manifest at $MANIFEST_PATH" >&2
  exit 1
fi

PROPS_ENDPOINT="$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).propsEndpoint" "$MANIFEST_PATH")"
SSR_ROUTES_JSON="$(node -p "JSON.stringify(JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).ssrRoutes)" "$MANIFEST_PATH")"
LAMBDA_HANDLER="$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).lambdaHandler" "$MANIFEST_PATH")"

echo "[localstack] Creating S3 bucket if needed..."
awslocal s3api head-bucket --bucket "$BUCKET_NAME" >/dev/null 2>&1 || \
  awslocal s3api create-bucket --bucket "$BUCKET_NAME"

echo "[localstack] Syncing static assets to S3..."
awslocal s3 sync "$PUBLIC_DIR" "s3://$BUCKET_NAME" --delete

echo "[localstack] Enabling S3 website hosting..."
awslocal s3 website "s3://$BUCKET_NAME" \
  --index-document index.html \
  --error-document index.html >/dev/null

echo "[localstack] Packaging Lambda..."
rm -f "$LAMBDA_ZIP"
(cd "$SERVER_DIR" && zip -qr "$LAMBDA_ZIP" .)

echo "[localstack] Creating or updating Lambda..."
if awslocal lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  awslocal lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$LAMBDA_ZIP" >/dev/null
else
  awslocal lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs22.x \
    --zip-file "fileb://$LAMBDA_ZIP" \
    --handler "$LAMBDA_HANDLER" \
    --role arn:aws:iam::000000000000:role/lambda-role \
    --tags "{\"_custom_id_\":\"$FUNCTION_URL_SUBDOMAIN\"}" >/dev/null
fi

echo "[localstack] Waiting for Lambda to become active..."
python3 - "$FUNCTION_NAME" <<'PY'
import json
import subprocess
import sys
import time

function_name = sys.argv[1]

for _ in range(60):
    result = subprocess.run(
        ["awslocal", "lambda", "get-function", "--function-name", function_name],
        capture_output=True,
        text=True,
        check=True,
    )
    state = json.loads(result.stdout)["Configuration"].get("State")
    if state == "Active":
        sys.exit(0)
    time.sleep(1)

raise SystemExit("Lambda did not become Active in time")
PY

if awslocal lambda get-function-url-config --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  FUNCTION_URL="$(awslocal lambda get-function-url-config --function-name "$FUNCTION_NAME" | python3 -c 'import json,sys; print(json.load(sys.stdin)["FunctionUrl"])')"
else
  FUNCTION_URL="$(awslocal lambda create-function-url-config --function-name "$FUNCTION_NAME" --auth-type NONE | python3 -c 'import json,sys; print(json.load(sys.stdin)["FunctionUrl"])')"
fi

FUNCTION_URL_HOST="$(python3 -c 'import sys; from urllib.parse import urlparse; print(urlparse(sys.argv[1]).netloc)' "$FUNCTION_URL")"
S3_WEBSITE_ORIGIN_DOMAIN="${BUCKET_NAME}.s3-website.localhost.localstack.cloud:4566"

python3 - "$CF_DISTRIBUTION_CONFIG_PATH" "$S3_WEBSITE_ORIGIN_DOMAIN" "$FUNCTION_URL_HOST" "$PROPS_ENDPOINT" "$SSR_ROUTES_JSON" <<'PY'
import json
import sys

config_path, s3_origin, lambda_origin, props_endpoint, ssr_routes_json = sys.argv[1:]
ssr_routes = json.loads(ssr_routes_json)

cache_behaviors = []
ordered_patterns = [f"{props_endpoint}*"] + [f"{route}*" for route in ssr_routes if route != "/"]

for index, path_pattern in enumerate(ordered_patterns, start=1):
    cache_behaviors.append({
        "PathPattern": path_pattern,
        "TargetOriginId": "lambda-origin",
        "ViewerProtocolPolicy": "allow-all",
        "TrustedSigners": {"Enabled": False, "Quantity": 0},
        "TrustedKeyGroups": {"Enabled": False, "Quantity": 0},
        "AllowedMethods": {
            "Quantity": 3,
            "Items": ["GET", "HEAD", "OPTIONS"],
            "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
        },
        "SmoothStreaming": False,
        "Compress": True,
        "LambdaFunctionAssociations": {"Quantity": 0},
        "FunctionAssociations": {"Quantity": 0},
        "FieldLevelEncryptionId": "",
        "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
        "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3",
    })

distribution_config = {
    "CallerReference": "matcha-localstack-deploy",
    "Comment": "MatchaStack LocalStack distribution",
    "Enabled": True,
    "DefaultRootObject": "index.html",
    "Origins": {
        "Quantity": 2,
        "Items": [
            {
                "Id": "static-origin",
                "DomainName": s3_origin,
                "OriginPath": "",
                "CustomHeaders": {"Quantity": 0},
                "S3OriginConfig": {"OriginAccessIdentity": ""},
            },
            {
                "Id": "lambda-origin",
                "DomainName": lambda_origin,
                "CustomOriginConfig": {
                    "HTTPPort": 80,
                    "HTTPSPort": 443,
                    "OriginProtocolPolicy": "http-only",
                    "OriginSslProtocols": {
                        "Quantity": 1,
                        "Items": ["TLSv1.2"],
                    },
                },
            },
        ],
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "static-origin",
        "ViewerProtocolPolicy": "allow-all",
        "TrustedSigners": {"Enabled": False, "Quantity": 0},
        "TrustedKeyGroups": {"Enabled": False, "Quantity": 0},
        "AllowedMethods": {
            "Quantity": 3,
            "Items": ["GET", "HEAD", "OPTIONS"],
            "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
        },
        "SmoothStreaming": False,
        "Compress": True,
        "LambdaFunctionAssociations": {"Quantity": 0},
        "FunctionAssociations": {"Quantity": 0},
        "FieldLevelEncryptionId": "",
        "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    },
    "CacheBehaviors": {
        "Quantity": len(cache_behaviors),
        "Items": cache_behaviors,
    },
    "Aliases": {"Quantity": 0},
    "PriceClass": "PriceClass_All",
    "ViewerCertificate": {"CloudFrontDefaultCertificate": True},
    "Restrictions": {
        "GeoRestriction": {
            "RestrictionType": "none",
            "Quantity": 0,
        }
    },
    "HttpVersion": "http2",
    "IsIPV6Enabled": True,
}

with open(config_path, "w", encoding="utf-8") as fh:
    json.dump(distribution_config, fh)
PY

echo "[localstack] Creating CloudFront distribution..."
EXISTING_DISTRIBUTION_ID="$(awslocal cloudfront list-distributions | python3 -c 'import json,sys; data=json.load(sys.stdin); items=data.get("DistributionList", {}).get("Items", []); match=next((item["Id"] for item in items if item.get("Comment")=="MatchaStack LocalStack distribution"), ""); print(match)')"

if [[ -n "$EXISTING_DISTRIBUTION_ID" ]]; then
  DISTRIBUTION_ETAG="$(awslocal cloudfront get-distribution-config --id "$EXISTING_DISTRIBUTION_ID" --query ETag --output text)"
  DISTRIBUTION_DOMAIN="$(awslocal cloudfront update-distribution \
    --id "$EXISTING_DISTRIBUTION_ID" \
    --if-match "$DISTRIBUTION_ETAG" \
    --distribution-config "file://$CF_DISTRIBUTION_CONFIG_PATH" | \
    python3 -c 'import json,sys; print(json.load(sys.stdin)["Distribution"]["DomainName"])')"
else
  DISTRIBUTION_DOMAIN="$(awslocal cloudfront create-distribution --distribution-config "file://$CF_DISTRIBUTION_CONFIG_PATH" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Distribution"]["DomainName"])')"
fi

echo
echo "[localstack] Deployment complete"
echo "  S3 bucket:        s3://$BUCKET_NAME"
echo "  Lambda function:  $FUNCTION_NAME"
echo "  Lambda URL:       $FUNCTION_URL"
echo "  CloudFront URL:   https://$DISTRIBUTION_DOMAIN"
echo "  S3 website origin: http://$S3_WEBSITE_ORIGIN_DOMAIN"
echo
echo "Try:"
echo "  curl -k https://$DISTRIBUTION_DOMAIN/"
echo "  curl -k https://$DISTRIBUTION_DOMAIN/user-profile"
