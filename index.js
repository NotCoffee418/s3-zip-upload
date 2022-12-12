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
      SOURCE_DIR = null,
      DEST_FILE = null,
      BUCKET_NAME = null,
      AWS_SECRET_ID = null,
      AWS_SECRET_KEY = null,
      AWS_REGION = 'eu-central-1',
      ZIP_PATH = './tmp.zip'
    } = process.env

    // Validate inputs
    if (!SOURCE_DIR || !DEST_FILE || !BUCKET_NAME || !AWS_SECRET_ID ||
      !AWS_SECRET_KEY || !AWS_REGION || !ZIP_PATH) {
      let errorMessage = 'The following variables are missing: '
      if (!SOURCE_DIR) errorMessage += 'SOURCE_DIR '
      if (!DEST_FILE) errorMessage += 'DEST_FILE '
      if (!BUCKET_NAME) errorMessage += 'BUCKET_NAME '
      if (!AWS_SECRET_ID) errorMessage += 'AWS_SECRET_ID '
      if (!AWS_SECRET_KEY) errorMessage += 'AWS_SECRET_KEY '
      if (!AWS_REGION) errorMessage += 'AWS_REGION '
      if (!ZIP_PATH) errorMessage += 'ZIP_PATH '

      throw new Error(errorMessage)
    }

    // Validate source directory to be a directory
    const absSourceDir = path.resolve(SOURCE_DIR)
    if (!fs.lstatSync(SOURCE_DIR).isDirectory()) {
      throw Error(`Source directory "${absSourceDir}" is not a directory`)
    }

    // Compress directory
    console.log(`Creating zip file of directory ${path.resolve(SOURCE_DIR)}`)
    try {
      const archive = archiver('zip', { zlib: { level: 9 } })
      const stream = fs.createWriteStream(ZIP_PATH)
      await new Promise((resolve, reject) => {
        archive
          .directory(SOURCE_DIR, false)
          .on('error', err => reject(err))
          .pipe(stream)

        stream.on('close', () => resolve())
        archive.finalize()
      })
    } catch (err) {
      console.error('An error occurred while creating the zip file')
      throw err
    }

    // Init S3 upload
    console.log(`Initializing S3 upload to bucket "${BUCKET_NAME}"`)
    const s3 = new AWS.S3({ apiVersion: '2006-03-01', accessKeyId: AWS_SECRET_ID, secretAccessKey: AWS_SECRET_KEY, region: AWS_REGION })
    let fileData
    try {
      fileData = fs.readFileSync(`${ZIP_PATH}`)
    } catch (err) {
      console.log(`Failed to read file "${ZIP_PATH}"`)
      throw err
    }

    const req = {
      Body: fileData,
      Bucket: BUCKET_NAME,
      Key: DEST_FILE
    }

    console.log(`Uploading zip to "${BUCKET_NAME}" as "${DEST_FILE}"`)
    s3.upload(req, (err, data) => {
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
