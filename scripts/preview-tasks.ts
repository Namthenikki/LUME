/**
 * Runs every source adapter and prints the tasks it produces, without touching Firestore.
 * Shows which tasks a first sync would import (upcoming) and which it would ignore (already past).
 *
 *   npm run tasks:preview
 */
import { adapters } from '../lib/sources';
import { formatIST } from '../lib/time';

async function main() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // no .env.local: fall back to the real environment
  }
  const now = new Date();
  for (const adapter of adapters()) {
    const tasks = (await adapter.fetchTasks()).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    const upcoming = tasks.filter((t) => t.dueAt > now);
    console.log(`\n[${adapter.source}] ${tasks.length} tasks: ${upcoming.length} upcoming, ${tasks.length - upcoming.length} past (ignored)\n`);
    for (const t of tasks) {
      const opens = t.opensAt ? `  (opens ${formatIST(t.opensAt)})` : '';
      console.log(`${t.dueAt > now ? 'IMPORT' : 'ignore'}  ${formatIST(t.dueAt).padEnd(22)} ${t.type.padEnd(10)} ${t.course}`);
      console.log(`        ${t.title}${opens}`);
      console.log(`        id=${t.externalId}  url=${t.url ?? '-'}`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error(`\nERROR: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
