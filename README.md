# S3 Zip Upload Action

A GitHub Action for easily creating a zip file from a folder and uploading it to S3.  
This action can also be used to upload a pre-made zip file or any other single file.  
It supports Linux, Windows, and any other `runs-on` that can run Node. with content
type and user defined meta data

## Features

- Creates zip files and uploads them to S3
- Can upload pre-made zip files or any other single files
- Supports Linux, Windows, and other `runs-on` that can run Node
- Easy to configure and use

## Inputs

All inputs are environment variables. See the example below for usage.

## Required Parameters

| Parameter       | Description                  | Example                  |
| --------------- | ---------------------------- | ------------------------ |
| `AWS_SECRET_ID` | AWS access key ID            | `AKIAIOSFODNN7EXAMPLE`   |
| `AWS_SECRET_KEY`| AWS secret access key        | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `BUCKET_NAME`   | AWS bucket name              | `my-bucket`              |
| `SOURCE_PATH`   | Source file or directory     | `/path/to/source`        |
| `DEST_FILE`     | Output file name or path     | `destination-file.zip`   |

## Optional Parameters

| Parameter       | Description                  | Default                  | Example             |
| --------------- | ---------------------------- | ------------------------ | ------------------- |
| `STORAGE_CLASS` | AWS storage class            | `STANDARD`               | `ONEZONE_IA`        |
| `AWS_REGION`    | AWS region                   | `eu-central-1`           | `us-west-2`         |
| `SOURCE_MODE`   | Source mode                  | `ZIP`                    | `FILE`              |
| `S3_ENDPOINT`   | S3 endpoint override         | None                     | `https://s3.example.com` |
| `CONTENT_TYPE`  | Content type metadata        | `application/zip` (for zip uploads) | `application/x-msdownload` |
| `METADATA_KEY`  | user defined meta data key   | None                       | `x-amz-meta-version` |
| `METADATA_VALUE` | user defined meta data value | None                      | `9.99` |
| `AWS_SESSION_TOKEN` | Session token for temporary credentials (e.g. from OIDC) | None | `IQoJb3...` |
| `QUIET`         | `true` stops the action logging file names, paths, bucket and key (use it for public repos) | `false` | `true` |
| `ZIP_PATH`      | Where the temporary zip is written (must be outside `SOURCE_PATH`) | a private temp directory | `/tmp/out.zip` |

## Example usage

```yaml
name: Upload to S3
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Upload ZIP to S3
        uses: NotCoffee418/s3-zip-upload@v1.7
        env:
          AWS_SECRET_ID: ${{ secrets.AWS_SECRET_ID }}
          AWS_SECRET_KEY: ${{ secrets.AWS_SECRET_KEY }}
          BUCKET_NAME: ${{ secrets.BUCKET_NAME }}
          AWS_REGION: eu-central-1
          SOURCE_MODE: ZIP
          SOURCE_PATH: ./debug-override
          DEST_FILE: debug-action.zip
          CONTENT_TYPE: application/x-msdownload
          METADATA_KEY: x-amz-meta-version
          METADATA_VALUE: 9.99
```

## Security notes

- Pass `AWS_SECRET_ID` and `AWS_SECRET_KEY` from GitHub secrets. Use an IAM user that can only `s3:PutObject` to the one bucket or prefix it needs.
- Pin the action to a full commit SHA rather than a tag, and keep it current with Dependabot:
  `uses: NotCoffee418/s3-zip-upload@<full-commit-sha> # v1.7`
- `SOURCE_PATH` is zipped as-is. Don't point it at the repository root, or `.git`, `.env` and anything else in the checkout gets uploaded.
- `.env` files are **not** read by the action (only by `npm run debug`), so a checked-out repository can't change its configuration.
- The access key ID, secret key and session token are always masked in the log, and scrubbed from the action's own error output. Errors print only their message, never a stack trace.
- In public repositories set `QUIET: true`, otherwise every zipped file name appears in the (public) log.
- `S3_ENDPOINT` receives your credentials. A URL containing `user:password@` is refused. Use `https://`; a plain `http://` endpoint that isn't `localhost` logs a warning.
- Don't run this action from `pull_request_target` or on fork pull requests, and keep the secrets in an environment restricted to `main`.
- Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Manual action tests

Copy .env.example to .env and modify it.
Commands to run locally:

```bash
npm run debug # run using your .env configuration
npm run debug file # uploads a dummy file as debug-override/dog1.jpg
npm run debug zip # uploads a dummy folder as debug-override/debug-action.zip
```

## Tests

`npm test` builds `release/` and runs the bundle against a local fake S3 server. CI also fails if `release/` doesn't match the source.

## Releasing new version

1. Update the version in `package.json`
2. `npm run build` and commit `release/`
3. Create a new tag and release on GitHub
