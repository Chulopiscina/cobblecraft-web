import { defineConfig } from "vitest/config";

/**
 * Config de test PLANA (Node) - ver test/d1-fake.ts para por qué se abandonó
 * @cloudflare/vitest-pool-workers en este entorno concreto (bug de resolución de módulos de
 * workerd con rutas de Windows con espacios).
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
