import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { assertTestDatabase } from '../../src/test-utils/test-database-guard';

const envFile = resolve(__dirname, '../../.env.test');

if (existsSync(envFile)) {
  Object.assign(process.env, parseEnv(readFileSync(envFile, 'utf8')));
} else if (!process.env.TEST_DB_PROJECT_REF) {
  throw new Error(
    'backend/.env.test is missing. Copy backend/.env.test.example and fill in the test project values.',
  );
}

assertTestDatabase(process.env);
