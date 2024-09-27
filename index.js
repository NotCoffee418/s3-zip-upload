const core = require('@actions/core')
const path = require('path')
const os = require('os')
const fs = require('fs')
const archiver = require('archiver')
const { S3Client } = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')
require('dotenv').config()

async function main () {
  // Load data from environment variables
  let cleanupFiles = []
  try {
    const {
      SOURCE_PATH = null,
      DEST_FILE = null,
      BUCKET_NAME = null,
      AWS_SECRET_ID = null,
      AWS_SECRET_KEY = null,
      AWS_REGION = 'eu-central-1',
      S3_ENDPOINT = null,
      STORAGE_CLASS = 'STANDARD',
      ZIP_PATH = path.join(os.tmpdir(), 'tmp.zip'),
      SOURCE_MODE = 'ZIP', // ZIP, FILE
      METADATA_KEY = null,
      METADATA_VALUE = null,
      CONTENT_TYPE = 'application/x-msdownload'
    } = process.env

    // Validate inputs
    if (!SOURCE_PATH || !DEST_FILE || !BUCKET_NAME || !AWS_SECRET_ID ||
          !AWS_SECRET_KEY || !AWS_REGION || !ZIP_PATH || !CONTENT_TYPE) {
      let errorMessage = 'The following variables are missing: '
      if (!SOURCE_PATH) errorMessage += 'SOURCE_PATH '
      if (!DEST_FILE) errorMessage += 'DEST_FILE '
      if (!BUCKET_NAME) errorMessage += 'BUCKET_NAME '
      if (!AWS_SECRET_ID) errorMessage += 'AWS_SECRET_ID '
      if (!AWS_SECRET_KEY) errorMessage += 'AWS_SECRET_KEY '
      if (!AWS_REGION) errorMessage += 'AWS_REGION '
      if (!ZIP_PATH) errorMessage += 'ZIP_PATH '
      if (!SOURCE_MODE) errorMessage += 'SOURCE_MODE '
      if (!METADATA_KEY) errorMessage += 'METADATA_KEY '
      if (!METADATA_VALUE) errorMessage += 'METADATA_VALUE '
      if (!CONTENT_TYPE) errorMessage += 'CONTENT_TYPE '

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
      console.log(`Creating zip file of directory ${path.resolve(SOURCE_PATH)} at ${path.resolve(ZIP_PATH)}`)
      try {
        cleanupFiles.push(ZIP_PATH)
        const archive = archiver('zip', { zlib: { level: 9 } })
        const stream = fs.createWriteStream(ZIP_PATH)
        await new Promise((resolve, reject) => {
          archive
            .directory(SOURCE_PATH, false)
            .on('error', err => {
              console.error('Error inside archive:', err)
              reject(err)
            })
            .on('warning', warning => {
              console.warn('Warning:', warning)
            })
            .on('entry', entry => {
              console.log('Archiving:', entry.name)
            })
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
    console.log(`Initializing S3 upload to bucket "${BUCKET_NAME}"`);
    const s3Config = {
      apiVersion: '2006-03-01',
      credentials: {
        accessKeyId: AWS_SECRET_ID,
        secretAccessKey: AWS_SECRET_KEY
      },
      region: AWS_REGION
    };
    if (S3_ENDPOINT) {
      s3Config.endpoint = S3_ENDPOINT;
    }
    const s3 = new S3Client(s3Config);

    // Upload file
    const fileToUpload = SOURCE_MODE === modes.ZIP ? ZIP_PATH : SOURCE_PATH;
    let readStream
    try {
      readStream = fs.createReadStream(fileToUpload);
    } catch (err) {
      console.log(`Failed to read file "${fileToUpload}"`);
      throw err
    }

    const req = {
      Body: readStream,
      Bucket: BUCKET_NAME,
      Key: DEST_FILE,
      StorageClass: STORAGE_CLASS
    }
    if (METADATA_KEY && METADATA_VALUE) {
      req.Metadata = { METADATA_KEY: METADATA_VALUE }
    }
    if (CONTENT_TYPE) {
      req.ContentType = CONTENT_TYPE
    }

    console.log(`Uploading zip to "${BUCKET_NAME}" as "${DEST_FILE}"`);

    // Use the managed upload feature of the SDK to upload the stream
    const upload = new Upload({
      client: s3,
      params: req
    })

    try {
      await upload.done();
      console.log(`Succesful upload to ${BUCKET_NAME}`);
    } catch (err) {
      console.log(`Failed upload to ${BUCKET_NAME}`);
      throw Error(`S3 Upload error: ${err}`);
    }
  } catch (error) {
    core.setFailed(error.message)
  } finally {
    try {
      //cleanup temp files
      cleanupFiles.forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file)
        }
      })
    } catch (err) {
      console.error('An error occurred while cleaning up')
      console.error(err)
    }
  }
}

// Run it!
main()
