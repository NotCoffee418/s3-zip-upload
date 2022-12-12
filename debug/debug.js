const exec = require('@actions/exec')
const dotenv = require('dotenv')

dotenv.config(); // Load environment variables from .env

(async () => {
  // Pass all environment variables into the exec() function
  await exec.exec('node index.js', undefined, {
    env: { ...process.env }
  })
})()
