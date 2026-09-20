import { spawnSync } from 'node:child_process';

// Run inside the dev container after creating invento_phase6_verify on its
// PostgreSQL server. Credentials stay in the container environment.
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/invento_phase6_verify';
const env = { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'test', RUN_DATABASE_TESTS: '1' };
for (const args of [['run', 'prisma:migrate:deploy'], ['run', 'test:e2e']]) {
  const result = spawnSync('npm', args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
