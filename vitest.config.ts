import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    environment: "node",
    // Unitarias en src/ (dominio) y de punta a punta en test/ (incluye la de aislamiento, REGLAS §4).
    include: ["src/**/*.{spec,test}.ts", "test/**/*.e2e-spec.ts"],
    // Carga .env.local y .env.test.local (este último con SUPABASE_SECRET_KEY, solo pruebas).
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
