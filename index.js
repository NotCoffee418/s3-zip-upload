import * as core from '@actions/core'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import archiver from 'archiver'
import { S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

// Quote untrusted strings (file names, paths) before logging them so embedded
// newlines can't forge workflow commands such as "::add-mask::" in the log.
const q = value => JSON.stringify(String(value))

// Every credential we handle is registered here: it is masked by the runner
// (core.setSecret) and also scrubbed from our own output, so it can't leak
// through an error message the runner never saw as a secret.
const secrets = []
function addSecret (value) {
  if (!value || String(value).length < 4) return
  core.setSecret(String(value))
  secrets.push(String(value))
}
const redact = text => secrets.reduce((t, secret) => t.split(secret).join('***'), String(text))

// Message only (no stack, no extra properties of the error object), one line, scrubbed
const errText = err => redact(String(err?.message ?? err).replace(/[\r\n]+/g, ' '))

function isInside (parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

async function main () {
  // Load data from environment variables
  const cleanupFiles = []
  const cleanupDirs = []
  try {
    // Deliberately no dotenv here: a .env file in the checked-out workspace
    // must not be able to set S3_ENDPOINT and redirect the credentials.
    let {
      SOURCE_PATH = null,
      DEST_FILE = null,
      BUCKET_NAME = null,
      AWS_SECRET_ID = null,
      AWS_SECRET_KEY = null,
      AWS_SESSION_TOKEN = null,
      AWS_REGION = 'eu-central-1',
      S3_ENDPOINT = null,
      STORAGE_CLASS = 'STANDARD',
      ZIP_PATH = null,
      SOURCE_MODE = 'ZIP', // ZIP, FILE
      METADATA_KEY = null,
      METADATA_VALUE = null,
      CONTENT_TYPE = null,
      QUIET = 'false' // true: don't log file names, paths, bucket or key
    } = process.env

    // Make sure the credentials never show up in the log, even if they were not
    // passed in from a secret
    addSecret(AWS_SECRET_ID)
    addSecret(AWS_SECRET_KEY)
    addSecret(AWS_SESSION_TOKEN)

    const quiet = /^(1|true|yes)$/i.test(QUIET)
    const info = (...args) => { if (!quiet) console.info(...args) }

    // Validate required variables
    let missingVars = ''
    if (!SOURCE_PATH) missingVars += 'SOURCE_PATH '
    if (!DEST_FILE) missingVars += 'DEST_FILE '
    if (!BUCKET_NAME) missingVars += 'BUCKET_NAME '
    if (!AWS_SECRET_ID) missingVars += 'AWS_SECRET_ID '
    if (!AWS_SECRET_KEY) missingVars += 'AWS_SECRET_KEY '
    if (!AWS_REGION) missingVars += 'AWS_REGION '
    if (!SOURCE_MODE) missingVars += 'SOURCE_MODE '
    if (missingVars.length > 0) {
      throw new Error(`The following variables are missing: ${missingVars}`)
    }

    // Validate source mode
    const modes = {
      ZIP: 'ZIP',
      FILE: 'FILE'
    }
    if (!Object.values(modes).includes(SOURCE_MODE)) {
      throw Error(`SOURCE_MODE ${q(SOURCE_MODE)} is not valid. See documentation remove the environment variable to use the default.`)
    }

    // Validate the custom endpoint. Credentials are sent to it, so it has to be http(s)
    if (S3_ENDPOINT) {
      let endpoint
      try {
        endpoint = new URL(S3_ENDPOINT)
      } catch (err) {
        throw Error('S3_ENDPOINT is not a valid URL')
      }
      if (endpoint.username || endpoint.password) {
        // Mask first so the value can't be printed if something echoes it later
        // (not the username: it's not a secret, and masking a short common word
        // would blank it out of the whole log and mangle our own messages)
        addSecret(S3_ENDPOINT)
        addSecret(endpoint.password)
        throw Error('S3_ENDPOINT must not contain a username or password')
      }
      if (!['https:', 'http:'].includes(endpoint.protocol)) {
        throw Error('S3_ENDPOINT must use https:// or http://')
      }
      if (endpoint.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
        core.warning('S3_ENDPOINT uses plain http. Your request is sent unencrypted; use https:// unless the endpoint is on a trusted network.')
      }
    }

    // Validate source mode and source path
    const absSourceDir = path.resolve(SOURCE_PATH)
    if (!fs.existsSync(absSourceDir)) {
      throw Error(`SOURCE_PATH ${q(absSourceDir)} does not exist`)
    }
    const sourceStats = fs.statSync(absSourceDir)
    if (SOURCE_MODE === modes.ZIP && !sourceStats.isDirectory()) {
      throw Error(`SOURCE_MODE is set to ZIP but SOURCE_PATH ${q(absSourceDir)} is not a directory`)
    } else if (SOURCE_MODE === modes.FILE && !sourceStats.isFile()) {
      throw Error(`SOURCE_MODE is set to FILE but SOURCE_PATH ${q(absSourceDir)} is not a file`)
    }

    // Compress directory if needed
    if (SOURCE_MODE === modes.ZIP) {
      if (!ZIP_PATH) {
        // Private, unpredictable directory: a fixed name in the shared tmp dir
        // could be pre-created or symlinked by another user on the machine
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-zip-upload-'))
        cleanupDirs.push(tmpDir)
        ZIP_PATH = path.join(tmpDir, 'tmp.zip')
      } else if (isInside(SOURCE_PATH, ZIP_PATH)) {
        throw Error('ZIP_PATH must not be inside SOURCE_PATH')
      }
      info(`Creating zip file of directory ${q(absSourceDir)} at ${q(path.resolve(ZIP_PATH))}`)
      try {
        cleanupFiles.push(ZIP_PATH)
        const archive = archiver('zip', { zlib: { level: 9 } })
        const stream = fs.createWriteStream(ZIP_PATH)
        await new Promise((resolve, reject) => {
          archive
            .directory(SOURCE_PATH, false)
            .on('error', err => {
              console.error('Error inside archive:', errText(err))
              reject(err)
            })
            .on('warning', warning => {
              console.warn('Warning:', errText(warning))
            })
            .on('entry', entry => {
              info('Archiving:', q(entry.name))
            })
            .pipe(stream)

          stream.on('error', reject)
          stream.on('close', () => resolve())
          archive.finalize()
        })

        // Override content type
        CONTENT_TYPE = 'application/zip'
      } catch (err) {
        console.error('An error occurred while creating the zip file')
        throw err
      }
    }

    // Init S3
    info(`Initializing S3 upload to bucket ${q(BUCKET_NAME)}`)
    const s3Config = {
      apiVersion: '2006-03-01',
      credentials: {
        accessKeyId: AWS_SECRET_ID,
        secretAccessKey: AWS_SECRET_KEY
      },
      region: AWS_REGION
    }
    if (AWS_SESSION_TOKEN) {
      s3Config.credentials.sessionToken = AWS_SESSION_TOKEN
    }
    if (S3_ENDPOINT) {
      s3Config.endpoint = S3_ENDPOINT
    }
    const s3 = new S3Client(s3Config)

    // Upload file
    const fileToUpload = SOURCE_MODE === modes.ZIP ? ZIP_PATH : SOURCE_PATH
    const readStream = fs.createReadStream(fileToUpload)

    const req = {
      Body: readStream,
      Bucket: BUCKET_NAME,
      Key: DEST_FILE,
      StorageClass: STORAGE_CLASS
    }
    if (METADATA_KEY && METADATA_VALUE) {
      // The SDK adds the x-amz-meta- prefix itself
      req.Metadata = { [METADATA_KEY.replace(/^x-amz-meta-/i, '')]: METADATA_VALUE }
    }
    if (CONTENT_TYPE) {
      req.ContentType = CONTENT_TYPE
    }

    info(`Uploading to ${q(BUCKET_NAME)} as ${q(DEST_FILE)}`)

    // Use the managed upload feature of the SDK to upload the stream
    const upload = new Upload({
      client: s3,
      params: req
    })

    try {
      await upload.done()
      console.info(quiet ? 'Successful upload' : `Successful upload to ${q(BUCKET_NAME)}`)
    } catch (err) {
      console.info(quiet ? 'Failed upload' : `Failed upload to ${q(BUCKET_NAME)}`)
      throw Error(`S3 Upload error: ${errText(err)}`)
    }
  } catch (error) {
    core.setFailed(errText(error))
  } finally {
    try {
      // cleanup temp files
      cleanupFiles.forEach(file => fs.rmSync(file, { force: true }))
      cleanupDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }))
    } catch (err) {
      console.error('An error occurred while cleaning up')
      console.error(errText(err))
    }
  }
}

// Run it!
main()
