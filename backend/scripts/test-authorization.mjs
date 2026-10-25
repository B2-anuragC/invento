import { spawnSync } from 'node:child_process';
const index = process.argv.indexOf('--database');
const database =
  index >= 0
    ? process.argv[index + 1]
    : process.env.AUTHORIZATION_TEST_DATABASE_URL;
if (!database || !/_(test|review)(_|$)/.test(new URL(database).pathname))
  throw new Error(
    'Pass --database with a dedicated database whose name contains _test or _review. Never use the development or production database.',
  );
const result = spawnSync(
  'npm',
  [
    'run',
    'test:e2e',
    '--',
    'test/authorization.e2e-spec.ts',
    'test/authorization-migration.e2e-spec.ts',
  ],
  {
    stdio: 'inherit',
    cwd: new URL('../', import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: database,
      RUN_AUTHORIZATION_DATABASE_TESTS: '1',
      JWT_ACCESS_SECRET: 'authorization-test-access-secret-1234567890',
      JWT_REFRESH_SECRET: 'authorization-test-refresh-secret-1234567890',
    },
  },
);
process.exit(result.status ?? 1);
