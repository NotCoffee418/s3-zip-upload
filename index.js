const core = require('@actions/core')
const path = require('path')
const fs = require('fs')
const archiver = require('archiver')
const AWS = require('aws-sdk')
require('dotenv').config()

async function main () {
// Load data from environment variables
  try {
    const {
      SOURCE_PATH = null,
      DEST_FILE = null,
      BUCKET_NAME = null,
      AWS_SECRET_ID = null,
      AWS_SECRET_KEY = null,
      AWS_REGION = 'eu-central-1',
      S3_ENDPOINT = null,
      ZIP_PATH = './tmp.zip', // Temporary zip file. Will not be removed automatically
      SOURCE_MODE = 'ZIP' // ZIP, FILE
    } = process.env

    // Validate inputs
    if (!SOURCE_PATH || !DEST_FILE || !BUCKET_NAME || !AWS_SECRET_ID ||
      !AWS_SECRET_KEY || !AWS_REGION || !ZIP_PATH) {
      let errorMessage = 'The following variables are missing: '
      if (!SOURCE_PATH) errorMessage += 'SOURCE_PATH '
      if (!DEST_FILE) errorMessage += 'DEST_FILE '
      if (!BUCKET_NAME) errorMessage += 'BUCKET_NAME '
      if (!AWS_SECRET_ID) errorMessage += 'AWS_SECRET_ID '
      if (!AWS_SECRET_KEY) errorMessage += 'AWS_SECRET_KEY '
      if (!AWS_REGION) errorMessage += 'AWS_REGION '
      if (!ZIP_PATH) errorMessage += 'ZIP_PATH '
      if (!SOURCE_MODE) errorMessage += 'SOURCE_MODE '

      throw new Error(errorMessage)
    }

    // Validate source mode
    const modes = {
      ZIP: 'ZIP',
      FILE: 'FILE'
    }
    if (!Object.values(modes).includes(SOURCE_MODE)) {
      throw Error(`SOURCE_MODE "${SOURCE_MODE}" is not valid. See documentation remove the environment variable to use the default.`)
    }

    // Validate source mode and source path
    const absSourceDir = path.resolve(SOURCE_PATH)
    if (!fs.existsSync(absSourceDir)) {
      throw Error(`SOURCE_PATH "${absSourceDir}" does not exist`)
    }
    const sourceStats = fs.lstatSync(SOURCE_PATH)
    if (SOURCE_PATH === modes.ZIP && !sourceStats.isDirectory()) {
      throw Error(`SOURCE_MODE is set to directory but SOURCE_PATH "${absSourceDir}" is not a directory`)
    } else if (SOURCE_PATH === modes.FILE && !sourceStats.isFile()) {
      throw Error(`SOURCE_MODE is set file but SOURCE_PATH "${absSourceDir}" is not a file`)
    }

    // Compress directory if needed
    if (SOURCE_MODE === modes.ZIP) {
      console.log(`Creating zip file of directory ${path.resolve(SOURCE_PATH)}`)
      try {
        const archive = archiver('zip', { zlib: { level: 9 } })
        const stream = fs.createWriteStream(ZIP_PATH)
        await new Promise((resolve, reject) => {
          archive
            .directory(SOURCE_PATH, false)
            .on('error', err => reject(err))
            .pipe(stream)

          stream.on('close', () => resolve())
          archive.finalize()
        })
      } catch (err) {
        console.error('An error occurred while creating the zip file')
        throw err
      }
    }

    // Init S3
    console.log(`Initializing S3 upload to bucket "${BUCKET_NAME}"`)
    const s3Config = {
      apiVersion: '2006-03-01',
      accessKeyId: AWS_SECRET_ID,
      secretAccessKey: AWS_SECRET_KEY,
      region: AWS_REGION
    }
    if (S3_ENDPOINT) {
      s3Config.endpoint = S3_ENDPOINT
    }
    const s3 = new AWS.S3(s3Config)

    // Upload file
    const fileToUpload = SOURCE_MODE === modes.ZIP ? ZIP_PATH : SOURCE_PATH
    let readStream
    try {
      readStream = fs.createReadStream(fileToUpload)
    } catch (err) {
      console.log(`Failed to read file "${fileToUpload}"`)
      throw err
    }

    const req = {
      Body: readStream,
      Bucket: BUCKET_NAME,
      Key: DEST_FILE
    }

    console.log(`Uploading zip to "${BUCKET_NAME}" as "${DEST_FILE}"`)

    // Use the managed upload feature of the SDK to upload the stream
    const upload = new AWS.S3.ManagedUpload({
      params: req,
      service: s3
    })

    upload.send((err, data) => {
      if (err) {
        console.log(`Failed upload to ${BUCKET_NAME}`)
        throw Error(`S3 Upload error: ${err}`)
      } else {
        console.log(`Succesful upload to ${BUCKET_NAME}`)
      }
    })
  } catch (error) {
    core.setFailed(error.message)
  }
}

// Run it!
main()
