declare const process: { env: Record<string, string | undefined> };
interface ShellDatabase {
  getSiblingDB(name: string): ShellDatabase;
  createUser(user: { user: string; pwd: string; roles: { role: string; db: string }[] }): void;
  createCollection(name: string, options: Record<string, unknown>): void;
  getCollection(name: string): { createIndex(keys: Record<string, number>, options?: Record<string, unknown>): void };
  auth(username: string, password: string): unknown;
  runCommand(command: Record<string, unknown>): { ok: number };
}
declare const db: ShellDatabase;
declare function quit(code: number): never;