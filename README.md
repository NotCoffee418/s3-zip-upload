# S3 Zip Upload Action

A GitHub Action for easily creating a zip file from a folder and uploading it to S3.  
This action can also be used to upload a pre-made zip file or any other single file.  
It supports Linux, Windows, and any other `runs-on` that can run Node.

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
| `AWS_SECRET_ID` | AWS access key ID            | `AKIAIOSFODNN7EXAMPLE`  |
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

## Example usage

```yaml
name: Upload to S3
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Upload ZIP to S3
        uses: NotCoffee418/s3-zip-upload@v1.3
        env:
          AWS_SECRET_ID: ${{ secrets.AWS_SECRET_ID }}
          AWS_SECRET_KEY: ${{ secrets.AWS_SECRET_KEY }}
          BUCKET_NAME: ${{ secrets.BUCKET_NAME }}
          AWS_REGION: eu-central-1
          SOURCE_MODE: ZIP
          SOURCE_PATH: ./debug-override
          DEST_FILE: debug-action.zip
```

## Manual action tests

Copy .env.example to .env and modify it.
Commands to run locally:

```bash
npm run debug # run using your .env configuration
npm run debug file # uploads a dummy file as debug-override/dog1.jpg
npm run debug zip # uploads a dummy folder as debug-override/debug-action.zip
```

## Releasing new version

1. Update the version in `package.json`
2. `npm run build`
3. Create a new tag and release on GitHub
