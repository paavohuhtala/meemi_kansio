export const HEALTH_CHECK_PORT = 4009;
export const FIRST_BACKEND_PORT = 4010;
export const TEST_DB_PORT = 5499;
export const BASE_DB_URL = `postgresql://meemi:meemi@localhost:${TEST_DB_PORT}`;
export const TEMPLATE_DB = 'meemi_e2e';

export function workerIndex(): number {
  return parseInt(process.env.TEST_PARALLEL_INDEX || '0', 10);
}

export function serverUrl(): string {
  return `http://localhost:${FIRST_BACKEND_PORT + workerIndex()}`;
}

export async function seedMedia(
  request: {
    post: (
      url: string,
      options?: object,
    ) => Promise<{ ok: () => boolean; status: () => number; text: () => Promise<string> }>;
  },
  count: number,
): Promise<void> {
  const res = await request.post(`${serverUrl()}/api/test/seed-media`, {
    data: { count },
  });
  if (!res.ok()) {
    throw new Error(`Seed media failed: ${res.status()} ${await res.text()}`);
  }
}

export async function resetDatabase(): Promise<void> {
  const res = await fetch(`http://localhost:${HEALTH_CHECK_PORT}/reset/${workerIndex()}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`Database reset failed: ${res.status} ${await res.text()}`);
  }
}
