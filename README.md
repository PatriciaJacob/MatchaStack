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
