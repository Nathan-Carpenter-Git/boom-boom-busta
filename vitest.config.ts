import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is client/: tests live at the project root.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
