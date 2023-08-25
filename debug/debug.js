const exec = require('@actions/exec')
const dotenv = require('dotenv')

dotenv.config()

// Optinal debug overrides using the debugdata folder
const param = process.argv[2] ?? 'zip'
if (param.toLowerCase() === 'zip') {
  console.log('debugging with override mode DIR_AS_ZIP')
  process.env.SOURCE_MODE = 'ZIP'
  process.env.SOURCE_PATH = './debug/debugdata'
  process.env.DEST_FILE = 'debug-override/debug-action.zip'
} else if (param.toLowerCase() === 'file') {
  console.log('debugging with override mode FILE')
  process.env.SOURCE_MODE = 'FILE'
  process.env.SOURCE_PATH = './debug/debugdata/dog1.jpg'
  process.env.DEST_FILE = 'debug-override/debug-dog.jpg'
}
//process.env.ZIP_PATH = './debug/debugdata.zip';

(async () => {
  // Pass all environment variables into the exec() function
  await exec.exec('node index.js', undefined, {
    env: { ...process.env }
  })
})()
