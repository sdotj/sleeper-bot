import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The GUI talks only to the local HTTP API; in dev, proxy /api to it so the
// browser never needs CORS and never sees a secret (dec.gui-architecture).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": process.env.SLEEPBOT_API ?? "http://127.0.0.1:8787" },
  },
});
