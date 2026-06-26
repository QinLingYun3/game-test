import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const sharedDir = path.resolve(rootDir, "shared");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": sharedDir
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5555,
    fs: {
      allow: [rootDir, sharedDir]
    },
    proxy: {
      "/api": "http://localhost:3333",
      "/ws": {
        target: "ws://localhost:3333",
        ws: true
      }
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 5555,
    allowedHosts: true
  }
});
