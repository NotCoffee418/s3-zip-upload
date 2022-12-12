# S3 Zip Upload Action
GitHub Action to create a zip file from a folder and upload it to S3


## Manual tests
Copy .env.example to .env and modify it.
Commands to run locally:

```bash
npm run debug # run using your .env configuration
npm run debug file # uploads a dummy file as debug-override/dog1.jpg
npm run debug folder # uploads a dummy folder as debug-override/debug-action.zip
```
