/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";

async function startServer() {
  const app = express();
  // Hostinger/Passenger can pass a port number or a socket path (string) via process.env.PORT.
  // We must not cast it directly to Number unless it represents a purely numeric port.
  const rawPort = process.env.PORT;
  const PORT = rawPort && !isNaN(Number(rawPort)) ? Number(rawPort) : rawPort || 3000;

  // JSON payload parser
  app.use(express.json());

  // Basic API Health Diagnostic Endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Enfermagem HNSR server active." });
  });

  // Hot Reload and Dev Server integrations or Static serving in production
  if (process.env.NODE_ENV !== "production" && process.env.DISABLE_HMR !== "true") {
    // Dynamic import of development-only dependency Vite to prevent execution crashes on Hostinger
    const { createServer: createViteServer } = await import("vite");
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

  // Listen routing depending on whether PORT is a number (TCP) or a string (socket path)
  if (typeof PORT === "number") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } else {
    // Socket path (for Passenger or similar hosting proxies)
    app.listen(PORT, () => {
      console.log(`Server running on socket path ${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
