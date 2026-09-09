import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifestPath = resolve(root, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const destination = valueAfter('--pack-destination')
const outputDirectory = destination === undefined ? root : resolve(root, destination)

function valueAfter(flag) {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

function collectExportTargets(value, targets = []) {
  if (typeof value === 'string') {
    if (value.startsWith('.')) targets.push(value)
    return targets
  }
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) collectExportTargets(child, targets)
  }
  return targets
}

function collectBinTargets(value) {
  if (typeof value === 'string') return [value]
  if (value !== null && typeof value === 'object') return Object.values(value).filter(value => typeof value === 'string')
  return []
}

function contractTargets(value) {
  return [...new Set([
    value.main,
    value.types,
    value.browser,
    ...collectExportTargets(value.exports),
    ...collectBinTargets(value.bin),
    value.dsh?.bundle?.patch,
  ].filter(target => typeof target === 'string' && target.startsWith('.')))]
}

function normalizeArchivePath(value) {
  return String(value).replace(/^package[\\/]/, '').replaceAll('\\', '/')
}

function isLocalSpec(value) {
  return typeof value === 'string' && (
    /^(?:link|workspace):/.test(value) ||
    /^file:(?:\.{1,2}[\\/]|[\\/])/.test(value)
  )
}

function sanitizedManifest() {
  const value = structuredClone(manifest)
  delete value.packageManager
  delete value.pnpm
  delete value.scripts
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(value[section] ?? {})) {
      if (!isLocalSpec(spec)) continue
      if (section === 'devDependencies') {
        delete value[section][name]
      } else {
        throw new Error(`non-portable ${section}.${name}=${spec}`)
      }
    }
  }
  return value
}

function packJson(cwd, extraArgs) {
  const raw = execFileSync('npm', [
    'pack', '--ignore-scripts', '--json', '--no-audit', '--no-fund', ...extraArgs,
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  const value = JSON.parse(raw)
  return Array.isArray(value) ? value[0] : value
}

function assertInsideRoot(target) {
  const resolved = resolve(root, target)
  const rel = relative(root, resolved)
  if (rel === '' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`contract target escapes package root: ${target}`)
  return resolved
}

const targets = contractTargets(manifest)
if (targets.length === 0) throw new Error('package declares no runtime contract targets')

const missing = targets.filter(target => !existsSync(assertInsideRoot(target)))
if (missing.length > 0) throw new Error(`build is incomplete; missing: ${missing.join(', ')}`)

const sourcePack = packJson(root, ['--dry-run'])
const sourceFiles = sourcePack.files ?? []
const sourcePaths = new Set(sourceFiles.map(file => normalizeArchivePath(file.path)))
const missingFromSourceArchive = targets
  .map(target => target.replace(/^\.\//, ''))
  .filter(target => !sourcePaths.has(target))
if (missingFromSourceArchive.length > 0) {
  throw new Error(`source packlist is missing runtime targets: ${missingFromSourceArchive.join(', ')}`)
}

const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'dsh-image-gen-pack-'))
try {
  const stagingRoot = resolve(temporaryRoot, 'package')
  await writeFile(resolve(temporaryRoot, 'manifest.json'), `${JSON.stringify(sanitizedManifest(), null, 2)}\n`)
  for (const file of sourceFiles) {
    const archivePath = normalizeArchivePath(file.path)
    const source = resolve(root, archivePath)
    const destinationPath = resolve(stagingRoot, archivePath)
    const rel = relative(stagingRoot, destinationPath)
    if (rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`packlist path escapes staging root: ${archivePath}`)
    if (archivePath === 'package.json') continue
    await mkdir(dirname(destinationPath), { recursive: true })
    await cp(source, destinationPath, { recursive: true })
  }
  await cp(resolve(temporaryRoot, 'manifest.json'), resolve(stagingRoot, 'package.json'))

  if (!checkOnly) await mkdir(outputDirectory, { recursive: true })
  const packed = packJson(stagingRoot, checkOnly ? ['--dry-run'] : ['--pack-destination', outputDirectory])
  const packedFiles = packed.files ?? []
  const packedPaths = new Set(packedFiles.map(file => normalizeArchivePath(file.path)))
  const missingFromArtifact = targets
    .map(target => target.replace(/^\.\//, ''))
    .filter(target => !packedPaths.has(target))
  if (missingFromArtifact.length > 0) {
    throw new Error(`final package is missing runtime targets: ${missingFromArtifact.join(', ')}`)
  }

  const forbidden = packedFiles
    .map(file => normalizeArchivePath(file.path))
    .filter(path => /(?:^|\/)node_modules(?:\/|$)|(?:^|\/)(?:pnpm-lock|package-lock)\.(?:yaml|json)$|(?:^|\/)(?:\.npmrc|\.pnpmfile\.cjs)$/.test(path))
  if (forbidden.length > 0) throw new Error(`final package contains forbidden files: ${forbidden.join(', ')}`)

  const packedManifest = sanitizedManifest()
  if (packedManifest.packageManager !== undefined || packedManifest.pnpm !== undefined || packedManifest.scripts !== undefined) {
    throw new Error('final package manifest contains source-only package-manager or script metadata')
  }
  const remainingLocalSpecs = []
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(packedManifest[section] ?? {})) {
      if (isLocalSpec(spec)) remainingLocalSpecs.push(`${section}.${name}=${spec}`)
    }
  }
  if (remainingLocalSpecs.length > 0) throw new Error(`final package contains local dependency specs: ${remainingLocalSpecs.join(', ')}`)

  if (checkOnly) {
    console.log(`package artifact contract passed: ${manifest.name}@${manifest.version}`)
    console.log(`verified targets: ${targets.join(', ')}`)
    console.log(`packlist files: ${packedFiles.length}`)
  } else {
    console.log(packed.filename ?? 'package artifact created')
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
