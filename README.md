# MatchaStack

A learning project: building a React metaframework from scratch.

## Roadmap

| # | Pattern | Status |
|---|---------|--------|
| 1 | SSG | Done |
| 2 | Hydration | Done |
| 3 | getStaticProps | Done |
| 4 | SSR + Loaders | - |
| 5 | RSC | - |
| 6 | Server Functions | - |

## Usage

```bash
npm run build
```

## AWS output

`npm run build` now emits two deploy targets:

- `dist/public`: upload to S3 behind CloudFront for static assets and prerendered HTML
- `dist/server`: zip and deploy to Lambda with handler `lambda-handler.handler`

The build also generates AWS deployment helpers in `dist/deploy/aws/`, including:

- `cloudfront-template.yaml`: a CloudFront + S3 stack that forwards SSR routes to Lambda
- `manifest.json`: the SSR route manifest and Lambda handler entrypoint
- `README.md`: packaging and deployment notes for the generated artifacts

## LocalStack

This repo includes a LocalStack deployment path that mirrors the production split:

- S3 serves `dist/public`
- Lambda serves SSR from `dist/server`
- CloudFront routes static traffic to S3 and SSR traffic to the Lambda Function URL

Start LocalStack:

```bash
docker compose -f docker-compose.localstack.yml up -d
```

Deploy the app:

```bash
npm run localstack:deploy
```

The deploy script will:

- build the app
- create or update the S3 bucket
- enable S3 website hosting for the static origin
- create or update the Lambda function and Function URL
- create or update a CloudFront distribution with the S3 website endpoint as the default origin and Lambda for SSR routes

Notes:

- Set `LOCALSTACK_AUTH_TOKEN` in your shell if your LocalStack setup requires it
- The script expects `awslocal`, `zip`, `python3`, and Docker-backed LocalStack Lambda support
- Static routes are served through CloudFront from the S3 website origin, while `/__matcha_props*` and SSR routes from `dist/deploy/aws/manifest.json` are routed to Lambda
- This LocalStack path intentionally avoids CloudFront Functions, since your logs showed `cloudfront.PublishFunction` returning `501`
