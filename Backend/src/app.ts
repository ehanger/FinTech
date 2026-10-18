import express from 'express';

// Persistence infrastructure only. Financial calculations never run on the server.
export function createApp(pingDatabase: () => Promise<void>) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      await pingDatabase();
      response.json({ status: 'ok', database: 'connected' });
    } catch {
      response.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });
  // No unauthenticated user-data endpoints: add authentication with future saved tools.
  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });
  return app;
}