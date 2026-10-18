import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from './app.js';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function start(ping: () => Promise<void>) {
  server = createApp(ping).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  return `http://127.0.0.1:${address.port}`;
}

describe('persistence service', () => {
  it('reports healthy database without exposing credentials', async () => {
    const url = await start(async () => {});
    const response = await fetch(`${url}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', database: 'connected' });
    expect(response.headers.get('x-powered-by')).toBeNull();
  });
  it('reports database failure safely', async () => {
    const url = await start(async () => { throw new Error('secret'); });
    const response = await fetch(`${url}/api/health`);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
  });
  it('does not expose user-data or calculation endpoints', async () => {
    const url = await start(async () => {});
    expect((await fetch(`${url}/api/mortgage`, { method: 'POST' })).status).toBe(404);
  });
});