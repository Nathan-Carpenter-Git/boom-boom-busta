import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  plugins: [react()],
  build: { outDir: "../dist/client", emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    // The game server runs on 8080 in dev; proxying keeps the client on one origin, like production.
    proxy: { "/ws": { target: "ws://localhost:8080", ws: true } },
  },
});
