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

**AWS_SECRET_ID**: AWS access key ID (required)  
**AWS_SECRET_KEY**: AWS secret access key (required)  
**AWS_BUCKET**: AWS bucket name (required)  
**AWS_REGION**: AWS region (defaults to eu-central-1)  
**SOURCE_MODE**: This can be `ZIP` or `FILE`. (defaults to `ZIP`)  
**SOURCE_PATH**: This should be a file or a directory depending on your source mode. (required)  
**DEST_FILE**: Output file name or path inside the bucket. (required)  

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
        uses: NotCoffee418/s3-zip-upload@v1
        env:
          AWS_SECRET_ID: ${{ secrets.AWS_SECRET_ID }}
          AWS_SECRET_KEY: ${{ secrets.AWS_SECRET_KEY }}
          AWS_BUCKET: ${{ secrets.AWS_BUCKET }}
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