import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const sourceDir = new URL('../migrations/', import.meta.url)
const targetDir = new URL('../supabase/migrations/', import.meta.url)
const timestamps = {
  '0010': '20260623171200',
  '0011': '20260623173400',
  '0012': '20260703142000',
  '0013': '20261107002000',
}

await mkdir(targetDir, { recursive: true })
const files = (await readdir(sourceDir)).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort()

for (const file of files) {
  const sequence = file.slice(0, 4)
  const timestamp = timestamps[sequence]
  if (!timestamp) throw new Error(`Add a stable timestamp mapping for ${file}`)
  const suffix = basename(file).replace(/^\d{4}_/, '')
  const destination = join(targetDir.pathname, `${timestamp}_${suffix}`)
  const source = await readFile(new URL(file, sourceDir), 'utf8')
  const banner = `-- Generated from migrations/${file}. Edit the source file, then run npm run db:prepare.\n`
  await writeFile(destination, banner + source)
  console.log(`prepared ${timestamp}_${suffix}`)
}
