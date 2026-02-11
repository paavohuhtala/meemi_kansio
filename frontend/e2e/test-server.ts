import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import pg from 'pg';

import {
  HEALTH_CHECK_PORT,
  FIRST_BACKEND_PORT,
  BASE_DB_URL,
  TEMPLATE_DB,
} from './helpers.ts';

const TEST_INSTANCES = parseInt(process.env.TEST_INSTANCES || '1', 10);
const SKIP_BUILD = process.env.SKIP_BUILD === '1';

const FRONTEND_DIR = resolve(import.meta.dirname, '..');
const ROOT_DIR = resolve(FRONTEND_DIR, '..');
const BACKEND_DIR = resolve(ROOT_DIR, 'backend');

const children: ChildProcess[] = [];

// --- Build ---

function buildFrontend() {
  console.log('Building frontend...');
  execSync('pnpm build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
}

function buildBackend() {
  console.log('Building backend...');
  execSync('cargo build', { cwd: BACKEND_DIR, stdio: 'inherit' });
}

// --- Database ---

async function createAdminClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: `${BASE_DB_URL}/meemi` });
  await client.connect();
  return client;
}

async function prepareTemplateDatabase() {
  console.log('Preparing template database...');
  const admin = await createAdminClient();

  // Unmark existing template if it exists
  await admin.query(
    `UPDATE pg_database SET datistemplate = false WHERE datname = $1`,
    [TEMPLATE_DB]
  );

  // Terminate any connections to the template DB
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEMPLATE_DB]
  );

  await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB}`);
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);

  // Run migrations via the backend binary (so sqlx _sqlx_migrations table is created properly)
  const binaryPath = resolve(BACKEND_DIR, 'target/debug/meemi-backend');
  const templateDbUrl = `${BASE_DB_URL}/${TEMPLATE_DB}`;
  const migrateChild = spawn(binaryPath, [], {
    env: {
      ...process.env,
      DATABASE_URL: templateDbUrl,
      PORT: '0',
      HOST: '127.0.0.1',
      RUST_LOG: 'info',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for it to start listening (means migrations succeeded), then kill it
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const onData = (data: Buffer) => {
      output += data.toString();
      if (output.includes('listening on')) {
        migrateChild.kill('SIGTERM');
        resolve();
      }
    };
    migrateChild.stdout?.on('data', onData);
    migrateChild.stderr?.on('data', onData);
    migrateChild.on('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`Migration backend exited with code ${code}:\n${output}`));
      }
    });
    setTimeout(() => reject(new Error(`Migration backend timed out:\n${output}`)), 30000);
  });

  // Mark as template
  await admin.query(
    `UPDATE pg_database SET datistemplate = true WHERE datname = $1`,
    [TEMPLATE_DB]
  );

  await admin.end();
  console.log('Template database ready');
}

async function recreateInstanceDatabase(
  admin: pg.Client,
  index: number
): Promise<void> {
  const dbName = `${TEMPLATE_DB}_${index}`;

  // Terminate connections to instance DB
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName]
  );

  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.query(`CREATE DATABASE ${dbName} TEMPLATE ${TEMPLATE_DB}`);
}

async function createInstanceDatabases(admin: pg.Client) {
  console.log(`Creating ${TEST_INSTANCES} instance databases...`);
  for (let i = 0; i < TEST_INSTANCES; i++) {
    await recreateInstanceDatabase(admin, i);
  }
}

// --- Reset queue (serializes template DB access) ---

type ResetRequest = { index: number; resolve: () => void };
const resetQueue: ResetRequest[] = [];
let resetWorkerRunning = false;

function startResetWorker(admin: pg.Client) {
  if (resetWorkerRunning) return;
  resetWorkerRunning = true;

  (async () => {
    while (true) {
      if (resetQueue.length > 0) {
        const req = resetQueue.shift()!;
        console.log(`Resetting database ${req.index}`);
        await recreateInstanceDatabase(admin, req.index);
        console.log(`Database ${req.index} reset`);
        req.resolve();
      } else {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  })();
}

function queueReset(index: number): Promise<void> {
  return new Promise((resolve) => {
    resetQueue.push({ index, resolve });
  });
}

// --- Backend processes ---

function spawnBackend(index: number): ChildProcess {
  const port = FIRST_BACKEND_PORT + index;
  const dbUrl = `${BASE_DB_URL}/${TEMPLATE_DB}_${index}`;
  const staticDir = resolve(FRONTEND_DIR, 'dist');
  const binaryPath = resolve(BACKEND_DIR, 'target/debug/meemi-backend');

  const child = spawn(binaryPath, [], {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      PORT: String(port),
      HOST: '0.0.0.0',
      STATIC_DIR: staticDir,
      RUST_LOG: 'info',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[backend-${index}] ${data}`);
  });
  child.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[backend-${index}] ${data}`);
  });

  children.push(child);
  return child;
}

async function waitForBackend(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Backend on port ${port} did not start within ${timeout}ms`);
}

// --- Health check + reset API server ---

function startOrchestrator(_admin: pg.Client): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200);
        res.end('OK');
        return;
      }

      const resetMatch = req.url?.match(/^\/reset\/(\d+)$/);
      if (req.method === 'POST' && resetMatch) {
        const index = parseInt(resetMatch[1], 10);
        if (index < 0 || index >= TEST_INSTANCES) {
          res.writeHead(400);
          res.end(`Invalid index: ${index}`);
          return;
        }

        try {
          await queueReset(index);
          res.writeHead(200);
          res.end('OK');
        } catch (err) {
          console.error(`Reset failed for index ${index}:`, err);
          res.writeHead(500);
          res.end('Reset failed');
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(HEALTH_CHECK_PORT, () => {
      console.log(`Orchestrator listening on port ${HEALTH_CHECK_PORT}`);
      resolve();
    });
  });
}

// --- Cleanup ---

function cleanup() {
  console.log('Cleaning up...');
  for (const child of children) {
    child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

// --- Main ---

async function main() {
  const startTime = Date.now();

  if (!SKIP_BUILD) {
    buildFrontend();
    buildBackend();
  }

  await prepareTemplateDatabase();

  const admin = await createAdminClient();
  await createInstanceDatabases(admin);

  startResetWorker(admin);

  console.log(`Spawning ${TEST_INSTANCES} backend instances...`);
  for (let i = 0; i < TEST_INSTANCES; i++) {
    spawnBackend(i);
  }

  // Wait for all backends to be healthy
  for (let i = 0; i < TEST_INSTANCES; i++) {
    await waitForBackend(FIRST_BACKEND_PORT + i);
    console.log(`Backend ${i} ready on port ${FIRST_BACKEND_PORT + i}`);
  }

  await startOrchestrator(admin);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `Test infrastructure ready in ${elapsed}s (${TEST_INSTANCES} instances)`
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  cleanup();
  process.exit(1);
});
