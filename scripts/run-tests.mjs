// Runs every automated check. Stand-in servers are used, so nothing here touches a real
// Minecraft server, a real AI service or a Microsoft account.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'node_modules', '.mo-test');
const env = { ...process.env, MO_PROJECT_ROOT: ROOT };

const only = process.argv[2];
const results = [];

function run(name, args) {
  console.log(`\n######## ${name}`);
  const result = spawnSync(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' });
  results.push([name, result.status === 0]);
}

async function bundled(name, entry, args = []) {
  const outfile = path.join(OUT, `${path.basename(entry, '.ts')}.mjs`);
  await build({
    entryPoints: [path.join(ROOT, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    logLevel: 'warning',
    alias: { '@main': path.join(ROOT, 'src/main'), '@shared': path.join(ROOT, 'src/shared') }
  });
  run(name, [outfile, ...args]);
}

if (only === 'swarm') await bundled('the whole team working together', 'test/swarm.test.ts');

if (!only || only === 'unit') {
  run('translations', ['scripts/check-translations.mjs']);
  await bundled('agents, permissions, memory, MCP client, skills', 'test/agent.test.ts');
  await bundled('code tasks with real Git', 'test/code.test.ts');
  await bundled('the whole team working together', 'test/swarm.test.ts');
}

if (!only || only === 'world') {
  await bundled('real bot on a real protocol server, 1.16.5', 'test/world.test.ts', ['1.16.5']);
  await bundled('real bot on a real protocol server, 1.21.4', 'test/world.test.ts', ['1.21.4']);
}

if (!only || only === 'e2e') {
  if (!fs.existsSync(path.join(ROOT, 'dist-cli/cli.mjs'))) {
    console.error('dist-cli/cli.mjs is missing. Run "npm run build:cli" first.');
    process.exit(1);
  }
  const mocks = spawn(process.execPath, ['test/mock-servers.cjs'], { cwd: ROOT, env, stdio: 'ignore' });
  await new Promise(resolve => setTimeout(resolve, 1500));
  run('command line, MCP server, status page, security', ['test/e2e.mjs']);
  mocks.kill();
}

fs.rmSync(OUT, { recursive: true, force: true });

console.log('\n######## summary');
for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
