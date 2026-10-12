// Runs the built release/index.js against a throwaway local HTTP server that pretends to be S3,
// then checks what actually went over the wire.
import { test, before, after } from 'node:test'
import assert from 'node:assert'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SECRET = 'test-secret-key-do-not-use'
let server, endpoint, workdir
const requests = []

before(async () => {
  server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(200, { ETag: '"abc"' })
      res.end()
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  endpoint = `http://127.0.0.1:${server.address().port}`
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 's3zu-test-'))
  fs.mkdirSync(path.join(workdir, 'src'))
  fs.writeFileSync(path.join(workdir, 'src', 'a.txt'), 'hello')
  fs.writeFileSync(path.join(workdir, 'file.bin'), 'file-contents')
})

after(() => {
  server.close()
  fs.rmSync(workdir, { recursive: true, force: true })
})

function run (env, cwd = workdir) {
  requests.length = 0
  // Async on purpose: a sync spawn would block the fake S3 server in this process.
  // Only the variables under test are passed, not the developer's own environment.
  return new Promise(resolve => {
    execFile(process.execPath, [path.join(__dirname, '..', 'release', 'index.js')], {
      cwd,
      timeout: 30000,
      env: {
        PATH: process.env.PATH,
        BUCKET_NAME: 'bkt',
        AWS_SECRET_ID: 'AKIATEST',
        AWS_SECRET_KEY: SECRET,
        S3_ENDPOINT: endpoint,
        DEST_FILE: 'out/dest',
        ...env
      }
    }, (error, stdout, stderr) => {
      resolve({ status: error ? error.code ?? 1 : 0, output: stdout + stderr })
    })
  })
}

test('FILE mode uploads the file with content type and metadata', async () => {
  const r = await run({ SOURCE_MODE: 'FILE', SOURCE_PATH: 'file.bin', CONTENT_TYPE: 'text/x-test', METADATA_KEY: 'x-amz-meta-version', METADATA_VALUE: '9.99' })
  assert.strictEqual(r.status, 0, r.output)
  const put = requests.find(x => x.method === 'PUT')
  assert.ok(put, 'no PUT received')
  assert.match(put.url, /out\/dest/)
  assert.strictEqual(put.headers['content-type'], 'text/x-test')
  assert.strictEqual(put.headers['x-amz-meta-version'], '9.99')
  assert.ok(!put.headers['x-amz-meta-x-amz-meta-version'])
  assert.ok(put.body.toString('latin1').includes('file-contents'))
})

test('ZIP mode uploads a zip and removes its temp files', async () => {
  const before = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('s3-zip-upload-'))
  const r = await run({ SOURCE_PATH: 'src' })
  assert.strictEqual(r.status, 0, r.output)
  const put = requests.find(x => x.method === 'PUT')
  assert.strictEqual(put.headers['content-type'], 'application/zip')
  assert.strictEqual(put.body.subarray(0, 2).toString(), 'PK')
  const after = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('s3-zip-upload-'))
  assert.deepStrictEqual(after, before)
})

// setSecret() prints "::add-mask::<value>", which the runner consumes and hides. Ignore those lines.
const visible = output => output.split('\n').filter(l => !l.startsWith('::add-mask::')).join('\n')

test('credentials are registered for masking and never printed otherwise', async () => {
  const r = await run({ SOURCE_MODE: 'FILE', SOURCE_PATH: 'file.bin' })
  assert.ok(r.output.includes(`::add-mask::${SECRET}`))
  assert.ok(r.output.includes('::add-mask::AKIATEST'))
  assert.ok(!visible(r.output).includes(SECRET))
  assert.ok(!visible(r.output).includes('AKIATEST'))
})

test('credentials echoed back in an S3 error are scrubbed', async () => {
  // Nothing listens on port 9, so the upload fails with a connection error
  const r = await run({ SOURCE_MODE: 'FILE', SOURCE_PATH: 'file.bin', S3_ENDPOINT: 'http://127.0.0.1:9', AWS_SESSION_TOKEN: 'session-token-value' })
  assert.notStrictEqual(r.status, 0)
  assert.ok(!visible(r.output).includes(SECRET))
  assert.ok(!visible(r.output).includes('session-token-value'))
})

test('QUIET hides file names, paths, bucket and key but still uploads', async () => {
  const r = await run({ SOURCE_PATH: 'src', QUIET: 'true' })
  assert.strictEqual(r.status, 0, r.output)
  assert.ok(requests.some(x => x.method === 'PUT'))
  const out = visible(r.output)
  assert.ok(!out.includes('a.txt'), out)
  assert.ok(!out.includes('out/dest'), out)
  assert.ok(!out.includes('bkt'), out)
  assert.ok(!out.includes(workdir), out)
  assert.match(out, /Successful upload/)
})

test('an S3_ENDPOINT with a password is refused and the password is masked', async () => {
  const r = await run({ SOURCE_MODE: 'FILE', SOURCE_PATH: 'file.bin', S3_ENDPOINT: 'https://user:hunter2pass@example.com' })
  assert.notStrictEqual(r.status, 0)
  assert.match(r.output, /must not contain a username or password/)
  assert.ok(r.output.includes('::add-mask::hunter2pass'))
  assert.ok(!visible(r.output).includes('hunter2pass'))
  assert.strictEqual(requests.length, 0)
})

test('the shipped bundle does not load .env files from the workspace', () => {
  // A .env in a checked-out repo could otherwise set S3_ENDPOINT and redirect the credentials
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'release', 'index.js'), 'utf8')
  assert.ok(!/dotenv\.config|require\(['"]dotenv|from ['"]dotenv/.test(bundle))
})

test('workflow commands in file names cannot reach the log', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3zu-names-'))
  try {
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'x\n::add-mask::hello'), 'x')
    const r = await run({ SOURCE_PATH: 'src' }, dir)
    assert.strictEqual(r.status, 0, r.output)
    assert.ok(!/^::add-mask::hello/m.test(r.output), r.output)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('rejects a SOURCE_MODE that does not match SOURCE_PATH', async () => {
  let r = await run({ SOURCE_MODE: 'ZIP', SOURCE_PATH: 'file.bin' })
  assert.match(r.output, /not a directory/)
  r = await run({ SOURCE_MODE: 'FILE', SOURCE_PATH: 'src' })
  assert.match(r.output, /not a file/)
  assert.strictEqual(requests.length, 0)
})

test('rejects bad endpoints and a ZIP_PATH inside the source', async () => {
  let r = await run({ SOURCE_MODE: 'FILE', SOURCE_PATH: 'file.bin', S3_ENDPOINT: 'file:///etc/passwd' })
  assert.match(r.output, /must use https/)
  r = await run({ SOURCE_PATH: 'src', ZIP_PATH: 'src/out.zip' })
  assert.match(r.output, /ZIP_PATH must not be inside SOURCE_PATH/)
  assert.strictEqual(requests.length, 0)
})
