// Runs before `npm run dev`, `build` and `test`: if node_modules is missing a package that
// package.json lists (or has a different version than package-lock.json pins), for example
// after pulling changes that added a dependency, it runs `npm install` first instead of
// letting Vite fail with "Failed to resolve import".
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))

const pkg = readJson('package.json')
const lock = existsSync(join(root, 'package-lock.json')) ? readJson('package-lock.json') : null
const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })

const outdated = names.filter((name) => {
  const manifest = join(root, 'node_modules', name, 'package.json')
  if (!existsSync(manifest)) return true
  const locked = lock?.packages?.[`node_modules/${name}`]?.version
  return locked !== undefined && readJson(join('node_modules', name, 'package.json')).version !== locked
})

if (outdated.length > 0) {
  console.log(`\nFaltan o están desactualizadas: ${outdated.join(', ')}.`)
  console.log('Instalando dependencias con «npm install»…\n')
  execSync('npm install', { cwd: root, stdio: 'inherit' })
}
