// Production Hardening V1 (Fase E/L) - valida que las migraciones D1 sean correctas ANTES de
// desplegar: nombres secuenciales sin huecos ni duplicados, y que apliquen limpio desde una base
// de datos vacía usando el mismo motor real (node:sqlite) que ya usan los tests
// (test/d1-fake.ts) - nunca un esquema paralelo inventado a mano para este script.
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite");

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

const NAME_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;
const errors = [];

const numbered = files
  .map((f) => {
    const match = NAME_RE.exec(f);
    if (!match) {
      errors.push(`Nombre de migración inválido (esperado NNNN_descripcion.sql): ${f}`);
      return null;
    }
    return { file: f, number: Number(match[1]) };
  })
  .filter((x) => x !== null)
  .sort((a, b) => a.number - b.number);

const seen = new Set();
let expected = 1;
for (const { file, number } of numbered) {
  if (seen.has(number)) errors.push(`Número de migración duplicado: ${file}`);
  seen.add(number);
  if (number !== expected) {
    errors.push(`Migraciones no secuenciales: se esperaba ${String(expected).padStart(4, "0")} pero se encontró ${file}`);
  }
  expected = number + 1;
}

// Aplicar todas las migraciones reales, en orden, sobre una BD nueva - si alguna falla (SQL
// inválido, referencia a una tabla que no existe todavía por un orden incorrecto), este script
// lo detecta ANTES de que lo detecte un despliegue real.
if (errors.length === 0) {
  const db = new DatabaseSync(":memory:");
  try {
    for (const { file } of numbered) {
      const sql = nodeRequire("node:fs").readFileSync(path.join(migrationsDir, file), "utf-8");
      db.exec(sql);
    }
    console.log(`✓ ${numbered.length} migración(es) validada(s): nombres correctos, orden secuencial, aplican limpio desde una BD vacía.`);
  } catch (err) {
    errors.push(`Fallo aplicando migraciones en orden: ${err.message}`);
  } finally {
    db.close();
  }
}

if (errors.length > 0) {
  console.error("✗ Validación de migraciones fallida:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
