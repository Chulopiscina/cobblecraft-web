import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

// Vite/vitest en este entorno no resuelve el especificador ESM "node:sqlite" de forma fiable -
// se carga vía `require` (Node siempre reconoce sus propios módulos "node:" en CJS) para evitar
// depender de una versión concreta de Vite. El `import type` de arriba aporta SOLO el tipo
// `DatabaseSync` (borrado en tiempo de compilación); el valor real en tiempo de ejecución viene
// de este `require`.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

/**
 * Web Oficial V1 - shim MINIMO de `D1Database` sobre SQLite real (`node:sqlite`, nativo desde
 * Node 22.5+, CERO dependencias nuevas), usado SOLO en tests. Decisión tomada tras comprobar en
 * este entorno concreto que:
 * 1. `@cloudflare/vitest-pool-workers` (el camino "oficial" de Cloudflare) falla de forma
 *    reproducible por un bug de resolución de módulos de workerd con rutas de Windows que
 *    contienen espacios ("Servidor Cobblemon").
 * 2. `better-sqlite3` (alternativa con SQLite real) requiere compilación nativa (node-gyp +
 *    Visual Studio Build Tools), no disponibles en este entorno.
 * `node:sqlite` es SQLite real embebido en el propio Node.js (marcado experimental, pero
 * suficiente para tests) - sin compilación nativa, sin dependencia externa nueva. Aplica las
 * MISMAS migraciones .sql reales de producción, nunca un esquema paralelo a mano.
 */
export interface FakeD1Result<T = unknown> {
  results: T[];
  success: true;
  meta: { changes: number; last_row_id: number };
}

class FakeD1PreparedStatement {
  private args: unknown[] = [];
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...args: unknown[]): FakeD1PreparedStatement {
    this.args = args;
    return this;
  }

  async run(): Promise<FakeD1Result> {
    const stmt = this.db.prepare(this.sql);
    if (/^\s*(SELECT|WITH)/i.test(this.sql)) {
      const rows = stmt.all(...(this.args as never[]));
      return { results: rows as unknown[], success: true, meta: { changes: 0, last_row_id: 0 } };
    }
    const info = stmt.run(...(this.args as never[]));
    return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }

  async first<T>(): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...(this.args as never[]));
    return (row as T) ?? null;
  }

  async all<T>(): Promise<FakeD1Result<T>> {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...(this.args as never[])) as T[];
    return { results: rows, success: true, meta: { changes: 0, last_row_id: 0 } };
  }
}

export class FakeD1Database {
  readonly raw: DatabaseSync;

  constructor(filename = ":memory:") {
    this.raw = new DatabaseSyncCtor(filename);
    this.raw.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql: string): FakeD1PreparedStatement {
    return new FakeD1PreparedStatement(this.raw, sql);
  }

  close(): void {
    this.raw.close();
  }

  async batch(statements: FakeD1PreparedStatement[]): Promise<FakeD1Result[]> {
    this.raw.exec("BEGIN");
    try {
      const results: FakeD1Result[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.raw.exec("COMMIT");
      return results;
    } catch (e) { this.raw.exec("ROLLBACK"); throw e; }
  }
}

/** Aplica todas las migraciones .sql reales (web/worker/migrations/*.sql) en orden, sobre la DB de test. */
export function applyRealMigrations(fake: FakeD1Database): void {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    fake.raw.exec(sql);
  }
}
