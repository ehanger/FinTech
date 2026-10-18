import { MongoClient } from 'mongodb';
import { createApp } from './app.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const databaseName = process.env.MONGO_DATABASE ?? 'fintech';
const client = new MongoClient(`mongodb://${process.env.MONGO_HOST ?? 'localhost'}:27017`, {
  auth: { username: required('MONGO_APP_USERNAME'), password: required('MONGO_APP_PASSWORD') },
  authSource: databaseName,
  serverSelectionTimeoutMS: 3000,
  connectTimeoutMS: 3000,
});
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');

try {
  await client.connect();
  const database = client.db(databaseName);
  const app = createApp(async () => { await database.command({ ping: 1 }, { timeoutMS: 3000 }); });
  const server = app.listen(port, '0.0.0.0', () => console.log(`FinTech API listening on ${port}`));
  const shutdown = () => {
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();
    server.close(() => { void client.close().then(() => process.exit(0)); });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch {
  console.error('Unable to start API. Check MongoDB availability and credentials.');
  await client.close();
  process.exitCode = 1;
}