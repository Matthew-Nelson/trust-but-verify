// Prints the configuration once per run, including why gray-box tests will skip.
import { TARGET_API, PUBLIC_BASE_URL, COUNTRY_HEADER, hasDb, hasBin, GRAY_SKIP, SPAWN_SKIP } from './config.ts';

export default function setup(): void {
  const lines = [
    `TARGET_API=${TARGET_API}`,
    `PUBLIC_BASE_URL (expected)=${PUBLIC_BASE_URL}`,
    `COUNTRY_HEADER (expected)=${COUNTRY_HEADER}`,
    hasDb ? 'DATABASE_URL is set: gray-box tests will run' : GRAY_SKIP,
    hasBin ? 'API_BIN is set: spawned-instance tests will run' : SPAWN_SKIP,
  ];
  console.log(`\n[harness] ${lines.join('\n[harness] ')}\n`);
}
