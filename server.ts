/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  // Hostinger/Passenger can pass a port number or a socket path (string) via process.env.PORT.
  // We must not cast it directly to Number unless it represents a purely numeric port.
  const rawPort = process.env.PORT;
  const PORT = rawPort && !isNaN(Number(rawPort)) ? Number(rawPort) : rawPort || 3000;

  // JSON payload parser
  app.use(express.json());

  // Lazy-loaded Gemini API Client
  let geminiClient: any = null;
  const getGeminiClient = () => {
    if (!geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("A variável de ambiente GEMINI_API_KEY não foi configurada.");
      }
      geminiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return geminiClient;
  };

  // Basic API Health Diagnostic Endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Enfermagem HNSR server active." });
  });

  // AI-Powered CID-10 Search Endpoint powered by Gemini
  app.post("/api/cid10/search", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "O parâmetro 'query' de pesquisa é obrigatório." });
      }

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Encontre os códigos de CID-10 (Classificação Internacional de Doenças v10) mais prováveis e pertinentes para a seguinte busca em português relacionado a atestados e saúde: "${query}". Retorne múltiplas opções lógicas (código oficial exacto, descrição correta e nota clínica para enfermagem).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              results: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    codigo: { type: Type.STRING, description: "Código oficial da doença no CID-10 (Ex: G43.9, B34.2, Z76.2)" },
                    descricao: { type: Type.STRING, description: "Descrição ou nome oficial da condição em português brasileiro" },
                    detalhes: { type: Type.STRING, description: "Breve explicação sobre os sintomas comuns, diagnóstico ou indicação útil" }
                  },
                  required: ["codigo", "descricao", "detalhes"]
                }
              }
            },
            required: ["results"]
          }
        }
      });

      const text = response.text || "{\"results\":[]}";
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Erro na busca de CID-10 via Gemini:", error);
      res.status(500).json({
        error: "Erro ao processar a pesquisa de CID-10 via IA.",
        details: error.message || String(error)
      });
    }
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
