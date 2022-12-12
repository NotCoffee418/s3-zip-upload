# S3 Zip Upload Action
A GitHub Action for easily creating a zip file from a folder and uploading it to S3. This action can also be used to upload a pre-made zip file or any other single file. It supports Linux, Windows, and any other `runs-on` that can run Node.

## Features
- Creates zip files and uploads them to S3
- Can upload pre-made zip files or any other single files
- Supports Linux, Windows, and other `runs-on` that can run Node
- Easy to configure and use

## Usage
(coming soon)


## Manual tests
Copy .env.example to .env and modify it.
Commands to run locally:

```bash
npm run debug # run using your .env configuration
npm run debug file # uploads a dummy file as debug-override/dog1.jpg
npm run debug folder # uploads a dummy folder as debug-override/debug-action.zip
```
