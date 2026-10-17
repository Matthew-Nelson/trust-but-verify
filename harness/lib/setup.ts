// Vitest setup: closes the gray-box pool after each file.
import { afterAll } from 'vitest';
import { closeDb } from './db.ts';

afterAll(async () => {
  await closeDb();
});
