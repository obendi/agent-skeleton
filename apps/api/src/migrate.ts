import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
try {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(718202609)`;
    await tx`CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const directory = new URL('../migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
      const source = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const [existing] = await tx`SELECT checksum FROM app_migrations WHERE name = ${name}`;
      if (existing) { if (existing.checksum !== checksum) throw new Error(`Modified migration: ${name}`); continue; }
      await tx.unsafe(source);
      await tx`INSERT INTO app_migrations (name, checksum) VALUES (${name}, ${checksum})`;
    }
    const [role] = await tx`SELECT 1 FROM pg_roles WHERE rolname = 'webapp_app'`;
    if (role) {
      await tx`GRANT USAGE ON SCHEMA public TO webapp_app`;
      await tx`GRANT SELECT ON users TO webapp_app`;
      await tx`GRANT SELECT, INSERT, DELETE ON sessions TO webapp_app`;
    }
  });
} finally { await sql.end(); }
