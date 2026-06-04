/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  // Standard port as required by proxy mapping
  const PORT = 3000;

  // JSON payload parser
  app.use(express.json());

  // Basic API Health Diagnostic Endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Enfermagem HNSR server active." });
  });

  // Hot Reload and Dev Server integrations or Static serving in production
  if (process.env.NODE_ENV !== "production" && process.env.DISABLE_HMR !== "true") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving static files from dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
