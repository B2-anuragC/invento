import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const backend = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
if (existsSync(join(backend, '.env'))) process.loadEnvFile(join(backend, '.env'));
const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
if (!process.env.TEST_DATABASE_URL) url.pathname = '/invento_phase8_verify';
if (!/(?:test|verify)/i.test(url.pathname)) throw new Error('Verification requires a database name containing test or verify.');
const env = { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'test', RUN_DATABASE_TESTS: '1' };
const prisma = require.resolve('prisma');
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
for (const args of [[prisma, 'migrate', 'deploy'], [prisma, 'migrate', 'status'], [prisma, 'migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], [vitest, 'run', '--config', './vitest.config.e2e.ts']]) {
  const result = spawnSync(process.execPath, args, { cwd: backend, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
