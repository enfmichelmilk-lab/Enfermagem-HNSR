/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs } from "firebase/firestore";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  
  // URL-encoded parser for standard/twilio webhooks
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));
  // Hostinger/Passenger can pass a port number or a socket path (string) via process.env.PORT.
  // We must not cast it directly to Number unless it represents a purely numeric port.
  const rawPort = process.env.PORT;
  const PORT = rawPort && !isNaN(Number(rawPort)) ? Number(rawPort) : rawPort || 3000;

  // JSON payload parser configured with larger limit to support base64 uploads of certificates
  app.use(express.json({ limit: "20mb" }));

  // Initialize Firestore on backend
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  let db: any = null;
  if (fs.existsSync(firebaseConfigPath)) {
    try {
      const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
      if (firebaseConfig && firebaseConfig.apiKey) {
        const firebaseApp = initializeApp(firebaseConfig);
        db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || undefined);
        console.log("[Firebase Backend] Conectado ao banco Firestore com sucesso.");
      }
    } catch (err) {
      console.error("[Firebase Backend Error] Falha ao ler ou conectar:", err);
    }
  }

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

  // Helper function to call Gemini API with automatic retry and model fallback for high reliability
  async function generateContentWithRetry(client: any, params: any, maxAttempts = 3, initialDelayMs = 2000) {
    const originalModel = params.model;
    const modelsToTry = [originalModel, "gemini-3.1-flash-lite"];
    
    for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      const currentModel = modelsToTry[mIdx];
      params.model = currentModel;
      let attempt = 0;
      
      while (attempt < maxAttempts) {
        try {
          attempt++;
          console.log(`[Gemini API] Tentando modelo ${currentModel} (Tentativa ${attempt}/${maxAttempts})...`);
          const result = await client.models.generateContent(params);
          console.log(`[Gemini API] Sucesso com o modelo ${currentModel} na tentativa ${attempt}!`);
          return result;
        } catch (error: any) {
          console.error(`[Gemini API Erro] Modelo: ${currentModel}, Tentativa: ${attempt} de ${maxAttempts}. Erro:`, error);
          
          const errorMsg = error?.message || String(error);
          const isRateLimitOrOverload = 
            error?.status === "UNAVAILABLE" || 
            error?.statusCode === 503 ||
            error?.status === "RESOURCE_EXHAUSTED" ||
            error?.statusCode === 429 ||
            errorMsg.includes("503") ||
            errorMsg.includes("high demand") ||
            errorMsg.includes("UNAVAILABLE") ||
            errorMsg.includes("RESOURCE_EXHAUSTED") ||
            errorMsg.includes("overloaded") ||
            errorMsg.includes("temporarily unavailable");

          if (isRateLimitOrOverload && attempt < maxAttempts) {
            const delay = initialDelayMs * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4);
            console.warn(`[Gemini API] Instabilidade detectada. Aguardando ${Math.round(delay)}ms antes da próxima tentativa...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          
          // Se falhou todas as tentativas e há outro modelo disponível na lista, vamos para o fallback
          if (mIdx < modelsToTry.length - 1) {
            console.warn(`[Gemini API] Falha persistente com o modelo ${currentModel}. Alternando para o modelo de fallback...`);
            break;
          }
          
          // Se for o último modelo da lista, relançar o erro
          throw error;
        }
      }
    }
    throw new Error("Falha ao processar requisição com todos os modelos disponíveis.");
  }

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

  // AI-Powered Medical Certificate Field Extraction Endpoint
  app.post("/api/absenteismo/extract", async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body;
      if (!fileBase64 || !mimeType) {
        return res.status(400).json({ error: "Parâmetros 'fileBase64' e 'mimeType' são obrigatórios." });
      }

      // Strip potential base64 prefix
      let cleanBase64 = fileBase64;
      if (fileBase64.includes(";base64,")) {
        cleanBase64 = fileBase64.split(";base64,").pop();
      }

      const client = getGeminiClient();
      let response;
      const contentParams = {
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Examine este documento em anexo (pode ser uma foto, escaneamento ou PDF de um atestado médico) e extraia os campos cruciais para o preenchimento de absenteísmo. 
Retorne as informações estritamente estruturadas no formato JSON especificado. 
Seja preciso e busque nos textos legíveis do atestado. Se algum campo não for encontrado, responda com string vazia ou o valor de default descrito.`,
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              colaborador_nome_original: { 
                type: Type.STRING, 
                description: "Nome completo do paciente/colaborador conforme escrito no atestado." 
              },
              data_inicio: { 
                type: Type.STRING, 
                description: "Data de início do repouso/afastamento no formato YYYY-MM-DD. Se não for explícito, assuma a data de emissão do atestado." 
              },
              duracao_dias: { 
                type: Type.INTEGER, 
                description: "Quantidade de dias de afastamento (inteiro maior ou igual a 1). Se estiver em horas, converta para dias arredondando para cima (ex: 12h ou 24h = 1 dia)." 
              },
              cid: { 
                type: Type.STRING, 
                description: "Código CID-10 identificado (ex: M54.5, A09, Z76.3). Retorne apenas o código limpo, sem pontos ou espaços adicionais se possível, ou retorne em formato padrão. Caso não possua CID escrito, retorne string vazia." 
              },
              patologia_diagnostico: { 
                type: Type.STRING, 
                description: "Descrição rápida ou diagnóstico/sintomas descritos no atestado (ex: gastroenterite, lombalgia, etc.)." 
              },
              medico_nome: { 
                type: Type.STRING, 
                description: "Nome completo do médico emissor." 
              }
            },
            required: ["colaborador_nome_original", "data_inicio", "duracao_dias"]
          }
        }
      };

      try {
        console.log(`[Absenteismo API] Tentando extração de atestado com gemini-3.5-flash...`);
        response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          ...contentParams
        });
      } catch (firstErr: any) {
        console.warn(`[Absenteismo API] Falha com gemini-3.5-flash: ${firstErr.message || firstErr}. Tentando fallback com gemini-2.5-flash...`);
        response = await client.models.generateContent({
          model: "gemini-2.5-flash",
          ...contentParams
        });
      }

      const text = response.text || "{}";
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Erro na extração do atestado via Gemini:", error);
      res.status(500).json({
        error: "Erro ao analisar o atestado médico via Inteligência Artificial.",
        details: error.message || String(error)
      });
    }
  });

  // AI-Powered WhatsApp Webhook Receiver
  app.post("/api/webhook/whatsapp", async (req, res) => {
    try {
      console.log("[WhatsApp Webhook] Recebida nova requisição:", req.body);

      const senderRaw = req.body.From || req.body.sender || req.body.phone || "";
      const messageBody = req.body.Body || req.body.text || req.body.message || "";
      const isTwilio = !!(req.body.From && req.body.AccountSid);
      
      const cleanSender = senderRaw.replace(/\D/g, ""); // e.g. "5581987654321"

      if (!senderRaw) {
        return res.status(400).json({ error: "Faltando parâmetro do remetente (From/sender/phone)." });
      }

      // Fetch all collaborators from database to match the sender
      let colaboradoresList: any[] = [];
      if (db) {
        try {
          const colRef = collection(db, "colaboradores");
          const snap = await getDocs(colRef);
          snap.forEach((doc) => {
            colaboradoresList.push({ ...doc.data(), id: doc.id });
          });
        } catch (dbErr) {
          console.error("Erro ao obter colaboradores em Firestore para WhatsApp:", dbErr);
        }
      }

      // Match collaborator by cell/whatsapp number
      let matchedColab = colaboradoresList.find(c => {
        if (!c.whatsapp) return false;
        const cleanColab = c.whatsapp.replace(/\D/g, "");
        return cleanColab.includes(cleanSender) || cleanSender.includes(cleanColab);
      });

      // Parse attachment / media if present
      let fileBase64 = req.body.fileBase64 || "";
      let mimeType = req.body.mimeType || "image/jpeg";
      const mediaUrl = req.body.MediaUrl0 || req.body.mediaUrl || "";

      if (mediaUrl) {
        try {
          console.log("[WhatsApp Webhook] Baixando mídia do URL:", mediaUrl);
          const fileRes = await fetch(mediaUrl);
          const arrayBuf = await fileRes.arrayBuffer();
          fileBase64 = Buffer.from(arrayBuf).toString("base64");
          mimeType = fileRes.headers.get("content-type") || "image/jpeg";
        } catch (dlErr: any) {
          console.error("[WhatsApp Webhook] Erro ao baixar anexos do URL:", dlErr.message);
        }
      }

      let parsedAI: any = null;
      let aiExtractionAttempted = false;

      if (fileBase64) {
        try {
          aiExtractionAttempted = true;
          // Clean potential data/mime headers
          let cleanBase64 = fileBase64;
          if (fileBase64.includes(";base64,")) {
            cleanBase64 = fileBase64.split(";base64,").pop();
          }

          const client = getGeminiClient();
          const aiResponse = await client.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              {
                inlineData: { mimeType, data: cleanBase64 },
              },
              {
                text: "Analise o atestado médico anexo e identifique: colaborador_nome_original, data_inicio (YYYY-MM-DD), duracao_dias (inteiro igual ou maior a 1) e código CID-10, patologia_diagnostico."
              }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  colaborador_nome_original: { type: Type.STRING },
                  data_inicio: { type: Type.STRING },
                  duracao_dias: { type: Type.INTEGER },
                  cid: { type: Type.STRING },
                  patologia_diagnostico: { type: Type.STRING }
                },
                required: ["colaborador_nome_original", "data_inicio", "duracao_dias"]
              }
            }
          });

          parsedAI = JSON.parse(aiResponse.text || "{}");
          console.log("[WhatsApp Webhook] Extração concluída com sucesso:", parsedAI);
        } catch (aiErr) {
          console.error("[WhatsApp Webhook] Erro na análise Gemini:", aiErr);
        }
      }

      // Try matching by extracted name if phone number matches didn't hit
      if (!matchedColab && parsedAI && parsedAI.colaborador_nome_original) {
        const cleanExtracted = parsedAI.colaborador_nome_original.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        matchedColab = colaboradoresList.find(c => {
          const cleanName = c.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return cleanName.includes(cleanExtracted) || cleanExtracted.includes(cleanName);
        });
      }

      let replyMsg = "";

      if (parsedAI) {
        const onsetDate = parsedAI.data_inicio || new Date().toISOString().split("T")[0];
        const formattedDate = onsetDate.split("-").reverse().join("/");
        const totalDays = parsedAI.duracao_dias || 1;
        const diseaseCid = (parsedAI.cid || "").trim().toUpperCase();
        const diseaseDesc = parsedAI.patologia_diagnostico || "Motivo Médico";

        if (matchedColab) {
          // Persist the database entry in Firestore!
          if (db) {
            const documentId = `abs_wa_${Date.now()}`;
            const newAbsItem = {
              id: documentId,
              tipo: "Atestado",
              colaborador: matchedColab.nome,
              matricula: matchedColab.matricula,
              setor: matchedColab.setor,
              cargo: matchedColab.cargo,
              turno: matchedColab.equipe || matchedColab.turno || "Unspecified",
              inicio: onsetDate,
              duracao: totalDays === 1 ? "1 Dia" : `${totalDays} Dias`,
              cid: diseaseCid,
              patologia: diseaseDesc,
              criadoEm: new Date().toISOString(),
              origem: "WhatsApp Webhook"
            };

            await setDoc(doc(db, "absenteismo", documentId), newAbsItem);
            console.log("[WhatsApp Webhook] Atestado salvo no Firestore para o colaborador:", matchedColab.nome);
          }

          replyMsg = `Olá, *${matchedColab.nome}*! 🏥\n\nRecebemos a foto do seu atestado médico. A nossa Inteligência Artificial já identificou os dados e registrou seu afastamento com sucesso!\n\n📅 *Início*: ${formattedDate}\n⏳ *Duração*: ${totalDays} dia(s)\n🩺 *CID*: ${diseaseCid || "Não especificado"}\n🔬 *Patologia*: ${diseaseDesc}\n\nO painel de escalas do *Hospital Nossa Senhora do Rosário* foi atualizado automaticamente. Melhore logo! ❤️`;
        } else {
          // Unmatched collaborator but successfully parsed
          replyMsg = `Olá! Recebemos e analisamos o atestado médico, mas não conseguimos localizar o seu número ou o nome de paciente *"${parsedAI.colaborador_nome_original}"* em nosso cadastro de enfermagem.\n\nFicha Extraída:\n📅 *Afastamento*: ${totalDays} dia(s) a partir de ${formattedDate}\n🩺 *CID*: ${diseaseCid}\n\nPor favor, acesse o painel das escalas para cadastrar seu número ou regularizar o atestado com seu gestor de enfermagem.`;
        }
      } else {
        // No media parsed or extraction failed
        if (matchedColab) {
          replyMsg = `Olá, *${matchedColab.nome}*! 👋\n\nRecebemos sua mensagem no canal de escalas do *Hospital Nossa Senhora do Rosário*.\n\nPara enviar um atestado, por favor envie uma **imagem legível (foto)** ou um arquivo **PDF** do atestado. Nossa Inteligência Artificial cuidará do preenchimento para você!`;
        } else {
          replyMsg = `Olá! Seja bem-vindo ao portal de Escalas e Absenteísmo do *Hospital Nossa Senhora do Rosário*! 🏥\n\nNão conseguimos reconhecer seu número. Para registrar um atestado:\n1. Certifique-se de que seu celular está cadastrado em sua ficha.\n2. Envie uma foto legível ou PDF do atestado médico para que nossa IA faça a leitura automática.`;
        }
      }

      // Response delivery depending on client origin
      if (isTwilio) {
        res.setHeader("Content-Type", "text/xml");
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyMsg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>
</Response>`;
        res.status(200).send(twiml);
      } else {
        // JSON API structure
        res.status(200).json({
          success: true,
          matchedColaborador: matchedColab ? matchedColab.nome : null,
          extracted: parsedAI,
          replyText: replyMsg
        });
      }

    } catch (whErr: any) {
      console.error("[WhatsApp Webhook Error]:", whErr);
      res.status(500).json({
        success: false,
        error: "Erro no processamento do webhook de WhatsApp.",
        details: whErr.message || String(whErr)
      });
    }
  });

  // AI-Powered Text Extraction Endpoint (e.g., pasted emails, WhatsApp chat logs, or OneDrive notes)
  app.post("/api/absenteismo/extract-text-list", async (req, res) => {
    try {
      const { textContent } = req.body;
      if (!textContent || !textContent.trim()) {
        return res.status(400).json({ error: "O parâmetro 'textContent' não pode estar vazio." });
      }

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            text: `Você é um assistente de gestão hospitalar. Analise o seguinte texto (que pode ser a cópia de uma conversa de grupo de WhatsApp de gestores, o corpo de um e-mail de justificativa, uma descrição de pasta compartilhada do OneDrive, ou uma lista digitada livremente) e identifique TODOS OS ATESTADOS MÉDICOS mencionados.

Texto para análise:
"""
${textContent}
"""

Extraia as informações e responda estritamente com o JSON contendo uma lista de objetos. Se nenhum atestado/afastamento for identificado, retorne uma lista vazia.

Gere apenas o vetor JSON válido, seguindo o esquema abaixo. Caso a data de início não esteja explícita, assuma o dia corrente (hoje é ${new Date().toISOString().split("T")[0]}).`,
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                colaborador_nome_original: { 
                  type: Type.STRING, 
                  description: "Nome completo do colaborador ou paciente citado." 
                },
                data_inicio: { 
                  type: Type.STRING, 
                  description: "Data de início do repouso no formato YYYY-MM-DD." 
                },
                duracao_dias: { 
                  type: Type.INTEGER, 
                  description: "Quantidade de dias de afastamento (inteiro maior ou igual a 1). Se estiver em horas, converta para dias (ex: 24h = 1 dia)." 
                },
                cid: { 
                  type: Type.STRING, 
                  description: "Código CID-10 identificado (ex: M545, A09, Z76). Deixe vazio se não tiver." 
                },
                patologia_diagnostico: { 
                  type: Type.STRING, 
                  description: "Descrição da queixa ou diagnóstico se houver." 
                }
              },
              required: ["colaborador_nome_original", "data_inicio", "duracao_dias"]
            }
          }
        }
      });

      const text = response.text || "[]";
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Erro na extração de texto em lote via Gemini:", error);
      res.status(500).json({
        error: "Erro ao analisar o texto enviado via Inteligência Artificial.",
        details: error.message || String(error)
      });
    }
  });

  // AI-Powered Leaves Extraction Endpoint (Extract from PDF or Image)
  app.post("/api/folgas/extract", async (req, res) => {
    try {
      const { fileBase64, mimeType, year, month } = req.body;
      if (!fileBase64 || !mimeType || !year || !month) {
        return res.status(400).json({ error: "Parâmetros 'fileBase64', 'mimeType', 'year' e 'month' são obrigatórios." });
      }

      let cleanBase64 = fileBase64;
      if (fileBase64.includes(";base64,")) {
        cleanBase64 = fileBase64.split(";base64,").pop();
      }

      const client = getGeminiClient();
      console.log(`[Folgas API] Tentando extração de folgas com gemini-3.5-flash para o mês ${month}/${year}...`);

      const response = await generateContentWithRetry(client, {
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Você é um robô de Inteligência Artificial especializado na leitura de tabelas e escalas de revezamento de profissionais de saúde de hospitais.
Sua missão é extrair com PRECISÃO GEOMÉTRICA ABSOLUTA todas as FOLGAS e AFASTAMENTOS desta escala de revezamento de enfermagem para o mês ${month} de ${year}.

Atenção, o usuário relatou que você "está colocando as folgas nos dias errados". Isso ocorre porque você está ignorando o alinhamento das colunas e apenas lendo os símbolos sequencialmente, sem considerar as células vazias (colunas em branco).

Para resolver isso de forma 100% precisa, você DEVE seguir rigorosamente o método de "Reconstrução de Linha de 31 Células":

MÉTODO DE RECONSTRUÇÃO DE LINHA DE 31 CÉLULAS (OBRIGATÓRIO):
1. Cada tabela tem no topo uma linha de cabeçalho com os dias de 1 a 31 organizados horizontalmente.
2. Para cada colaborador na tabela, identifique a sua linha correspondente que vem logo após a coluna "Horário".
3. Reconstrua mentalmente essa linha com exatamente 31 células, mapeando cada posição de coluna (1 a 31) ao seu conteúdo exato.
   - Se uma coluna estiver em branco ou contiver apenas traços/pontos, preencha a posição com "".
   - Se uma coluna contiver um turno de trabalho (ex: "UTI 7", "UTI 9", "M", "T", "D", "N", "19:00"), preencha com o nome do turno.
   - Se uma coluna contiver um símbolo de folga ou afastamento (ex: "F", "FF", "FE", "BH", "AT", "Férias"), coloque o símbolo na posição correta correspondente ao dia.
4. EXEMPLO DE RECONSTRUÇÃO CORRETA DA ADRIANA MAIA DE OLIVEIRA:
   Se a linha dela tem "UTI 7" sob a coluna 8, "F" sob a coluna 10, "UTI 9" sob a coluna 12, "F" sob a coluna 14, "UTI 9" sob a coluna 16, "UTI 9" sob a coluna 18, "UTI 7" sob a coluna 20, "F" sob a coluna 22, "UTI 9" sob a coluna 24, "UTI 7" sob a coluna 26.
   O array reconstruído de 31 posições DEVE ser exatamente:
   [
     "", "", "", "", "", "", "", "UTI 7", "", "F", 
     "", "UTI 9", "", "F", "", "UTI 9", "", "UTI 9", "", "UTI 7", 
     "", "F", "", "UTI 9", "", "UTI 7", "", "", "", "", ""
   ]
   Desta forma:
   - "UTI 7" está na 8ª célula -> Dia 08.
   - "F" está na 10ª célula -> Dia 10 (Data: ${year}-${month}-10).
   - "UTI 9" está na 12ª célula -> Dia 12.
   - "F" está na 14ª célula -> Dia 14 (Data: ${year}-${month}-14).
   - "UTI 9" está na 16ª célula -> Dia 16.
   - "UTI 9" está na 18ª célula -> Dia 18.
   - "UTI 7" está na 20ª célula -> Dia 20.
   - "F" está na 22ª célula -> Dia 22 (Data: ${year}-${month}-22).
   - "UTI 9" está na 24ª célula -> Dia 24.
   - "UTI 7" está na 26ª célula -> Dia 26.
   Qualquer tentativa de pular as células em branco ou aproximar os dias resultará em erro grave. Você DEVE contar rigorosamente cada coluna da esquerda para a direita a partir do Dia 1 até o Dia 31.

MAPEAMENTO DE SÍMBOLOS DE FOLGAS/AFASTAMENTOS:
- "F" -> "Folga" (Dia único)
- "BH" -> "Banco de Horas" (Dia único)
- "FF" -> "Folga Feriado" (Dia único)
- "FE" -> "Folga Enfermagem" (Dia único)
- "FÉRIAS" ou "FERIAS" ou "ERIA" (se estendendo por várias colunas de dias) -> "Férias". Por exemplo, se a palavra "FÉRIAS" ou "FERIAS" ou as letras "F", "E", "R", "I", "A", "S" cobrirem do dia 1 ao dia 17, você deve criar um registro de folga tipo "Férias" para CADA UM dos dias do intervalo (dia 01, 02, 03, ..., 17).
- "B" -> "Brigada de Incêndio"
- "E" -> "Eleição"
- "AT" -> "Atestado". Se estiver repetido em várias células seguidas (como "AT", "AT", "AT", "AT"), crie um registro individual do tipo "Atestado" para cada um desses dias específicos.
- "I" -> "Integração"

SÍMBOLOS QUE REPRESENTAM TRABALHO E DEVERÃO SER IGNORADOS:
- Turnos de trabalho: "M", "T", "D", "N", "PS", "U7", "U9", "U12", "6", "5", "4", "2|3", "13:00", "07:00", "19:00", "TRS", "TOTAL", "X" (no caso do INSS), "UTI 7", "UTI 9", "UTI".
- Células vazias ou preenchidas apenas com traços, pontos ou espaços.

SAÍDA FORMATADA:
Retorne estritamente um objeto JSON com a seguinte estrutura:
{
  "leaves": [
    {
      "matricula": "Número de matrícula encontrado na linha (se houver)",
      "colaborador": "Nome completo e limpo do colaborador",
      "data": "Data exata da folga no formato YYYY-MM-DD (Certifique-se de que o DD corresponde à coluna correta na grade!)",
      "tipo": "O nome do tipo de folga mapeado (Ex: 'Folga', 'Banco de Horas', 'Folga Feriado', 'Folga Enfermagem', 'Férias', 'Brigada de Incêndio', 'Eleição', 'Atestado', 'Integração')",
      "shorthand": "O símbolo original que foi encontrado na escala (Ex: 'F', 'BH', 'FF', 'FE', 'AT', 'FERIAS')"
    }
  ]
}

Seja extremamente rigoroso e preciso no alinhamento espacial de cada coluna de 1 a 31!`,
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              leaves: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    matricula: { type: Type.STRING, description: "Número de matrícula do colaborador." },
                    colaborador: { type: Type.STRING, description: "Nome completo do colaborador." },
                    data: { type: Type.STRING, description: "Data da folga no formato YYYY-MM-DD." },
                    tipo: { type: Type.STRING, description: "Tipo de folga mapeado (Ex: 'Folga', 'Banco de Horas', 'Folga Feriado', 'Folga Enfermagem', 'Férias', 'Brigada de Incêndio', 'Eleição', 'Atestado', 'Integração')." },
                    shorthand: { type: Type.STRING, description: "Símbolo original encontrado na célula (Ex: 'F', 'BH', 'FF', 'FE', 'FÉRIAS', 'B', 'E', 'AT', 'I')." }
                  },
                  required: ["matricula", "colaborador", "data", "tipo", "shorthand"]
                }
              }
            },
            required: ["leaves"]
          }
        }
      });

      const text = response.text || "{\"leaves\":[]}";
      try {
        const parsed = JSON.parse(text);
        res.json(parsed);
      } catch (parseError: any) {
        console.error("Erro ao analisar JSON do Gemini:", parseError, "Resposta bruta:", text);
        res.status(500).json({
          error: "O Gemini gerou um formato de dados inválido.",
          details: `JSON Parse Error: ${parseError.message}. Resposta bruta da IA: ${text.substring(0, 1000)}`
        });
      }
    } catch (error: any) {
      console.error("Erro na extração de folgas via Gemini:", error);
      res.status(500).json({
        error: "Erro ao analisar a escala de folgas via Inteligência Artificial.",
        details: error.message || String(error)
      });
    }
  });

  // Corporate University: AI-Powered Certificate File Analyzer
  app.post("/api/universidade/extract", async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body;
      if (!fileBase64 || !mimeType) {
        return res.status(400).json({ error: "Parâmetros 'fileBase64' e 'mimeType' são obrigatórios." });
      }

      let cleanBase64 = fileBase64;
      if (fileBase64.includes(";base64,")) {
        cleanBase64 = fileBase64.split(";base64,").pop();
      }

      console.log(`[Universidade API] Recebido arquivo para extração. mimeType: ${mimeType}, base64Length: ${cleanBase64?.length}`);

      const client = getGeminiClient();
      let response;
      const contentParams = {
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Examine este documento em anexo (pode ser uma foto, escaneamento ou PDF de um certificado de conclusão de curso da Universidade Corporativa Hapvida) e extraia os campos cruciais para o registro de capacitações acadêmicas.
Retorne as informações estritamente estruturadas no formato JSON especificado.
Se algum campo não for encontrado, responda com string vazia ou o valor de default descrito.

Regras de extração:
1. NOME COMPLETO DO COLABORADOR (Aluno/Beneficiário):
   - Localize o nome do profissional de saúde que concluiu o treinamento.
   - No padrão Hapvida, ele aparece centralizado, em destaque e em tamanho de fonte bem maior, logo abaixo da frase "CERTIFICAMOS QUE" e acima da seção "Concluiu o treinamento".
   - IGNORE COMPLETAMENTE e NUNCA extraia os nomes de gestores, gerentes ou diretores que assinam o certificado no final, tais como: "Claudia Perez" ou "Andrea Baldin" (Gerente de Educação Corporativa).
   - Se não for encontrado, retorne uma string vazia.

2. NOME DO CURSO OU CAPACITAÇÃO:
   - Identifique o título exato do curso que está destacado entre aspas duplas após a frase "Concluiu o treinamento" ou similar.
   - Exemplos reais de cursos: "Assédio e Discriminação", "Gerenciamento de Resíduos - 2026", "Guia de Boas Práticas: Uso e Remoção Segura de Hypafix®", "Integridade e Compliance - 2026".
   - Retorne o nome do curso exatamente como está escrito dentro do documento. Se não for encontrado, retorne uma string vazia.

3. DATA DE CONCLUSÃO:
   - Extraia a data em que o treinamento foi finalizado, que vem escrita por extenso no final da frase de conclusão.
   - Converta obrigatoriamente a data localizada para o formato ISO padrão: YYYY-MM-DD.
   - Caso nenhuma data de emissão ou conclusão seja localizada, retorne a data atual padrão: "${new Date().toISOString().split("T")[0]}".`,
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              colaborador_nome_original: { 
                type: Type.STRING, 
                description: "Nome completo do aluno/colaborador/profissional da saúde beneficiado pelo certificado." 
              },
              curso_nome: { 
                type: Type.STRING, 
                description: "Título ou nome de capacitação do curso concluído." 
              },
              data_conclusao: { 
                type: Type.STRING, 
                description: "Data em que o curso foi finalizado ou o certificado emitido, formato YYYY-MM-DD." 
              }
            },
            required: ["colaborador_nome_original", "curso_nome", "data_conclusao"]
          }
        }
      };

      try {
        console.log(`[Universidade API] Tentando extração de certificado com gemini-3.5-flash...`);
        response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          ...contentParams
        });
      } catch (firstErr: any) {
        console.warn(`[Universidade API] Falha com gemini-3.5-flash: ${firstErr.message || firstErr}. Tentando fallback com gemini-2.5-flash...`);
        response = await client.models.generateContent({
          model: "gemini-2.5-flash",
          ...contentParams
        });
      }

      const text = response.text || "{}";
      console.log("[Universidade API] Resposta bruta da IA:", text);
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Erro na extração do certificado da universidade corporativa via Gemini:", error);
      res.status(500).json({
        error: "Erro ao analisar o certificado via Inteligência Artificial.",
        details: error.message || String(error)
      });
    }
  });

  // Corporate University: AI-Powered Certificate Copied Text List Analyzer
  app.post("/api/universidade/extract-text-list", async (req, res) => {
    try {
      const { textContent } = req.body;
      if (!textContent || !textContent.trim()) {
        return res.status(400).json({ error: "O parâmetro 'textContent' não pode estar vazio." });
      }

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            text: `Você é um assistente de gestão de universidade corporativa hospitalar. Analise o seguinte texto (que pode ser a cópia de uma conversa de WhatsApp, notas de reuniões, comprovantes de conclusão, ou uma lista digitada livremente) e identifique TODOS OS CURSOS E CERTIFICADOS concluídos e reportados pelos profissionais de enfermagem.

Texto para análise:
"""
${textContent}
"""

Extraia as informações e responda estritamente com o JSON contendo uma lista de objetos. Se nada for identificado, retorne uma lista vazia.

Gere apenas o vetor JSON válido compatível com o esquema abaixo. Caso a data de conclusão não esteja explícita, use o dia atual (${new Date().toISOString().split("T")[0]}).`,
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                colaborador_nome_original: { 
                  type: Type.STRING, 
                  description: "Nome completo do colaborador citado como concluinte." 
                },
                curso_nome: { 
                  type: Type.STRING, 
                  description: "Nome ou título do curso ou treinamento realizado." 
                },
                data_conclusao: { 
                  type: Type.STRING, 
                  description: "Data de conclusão ou homologação no formato YYYY-MM-DD." 
                }
              },
              required: ["colaborador_nome_original", "curso_nome", "data_conclusao"]
            }
          }
        }
      });

      const text = response.text || "[]";
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Erro ao extrair texto de certificados via Gemini:", error);
      res.status(500).json({
        error: "Erro ao processar as conclusões de cursos enviadas via IA.",
        details: error.message || String(error)
      });
    }
  });


  // Corporate University: AI-Powered Bulk Course Ingestion
  app.post("/api/universidade/extract-courses-bulk", async (req, res) => {
    try {
      const { textContent } = req.body;
      if (!textContent || !textContent.trim()) {
        return res.status(400).json({ error: "O parâmetro 'textContent' não pode estar vazio." });
      }

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            text: `Você é um gestor de universidade corporativa em um hospital de alta complexidade.
Sua missão é ler o texto fornecido pelo usuário contendo solicitações de novos cursos ou um planejamento de treinamentos, identificar cada curso que deve ser criado, e determinar para quais cargos de enfermagem e saúde o curso deve ser direcionado (marcando se é obrigatório ou recomendado).

Cargos disponíveis no sistema (use EXATAMENTE estes nomes na propriedade 'obrigatorios' ou 'recomendados' como uma lista separada por vírgula):
- "Supervisor(a)"
- "Coordenador(a)"
- "Gerente"
- "Enfermeiro(a)"
- "Tec. Enf."
- "Aux. Enf."
- "Administrativo"
- "Estagiária"
- "Outros"

Se o curso for obrigatório para todos, preencha a propriedade 'obrigatorios' com todos esses cargos listados acima.

Texto para análise:
"""
${textContent}
"""

Extraia os cursos e seus respectivos públicos-alvo de acordo com o texto ou a melhor prática hospitalar caso o texto não seja totalmente explícito sobre a obrigatoriedade. Responda estritamente com o JSON contendo uma lista de objetos. Se nada for identificado, retorne uma lista vazia.`,
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                nome: { 
                  type: Type.STRING, 
                  description: "Nome ou título do curso/treinamento." 
                },
                descricao: { 
                  type: Type.STRING, 
                  description: "Ementa, descrição ou objetivo do treinamento." 
                },
                obrigatorios: {
                  type: Type.STRING,
                  description: "Nomes dos cargos para os quais este curso é OBRIGATÓRIO, separados por vírgula. Ex: 'Enfermeiro(a), Supervisor(a)'"
                },
                recomendados: {
                  type: Type.STRING,
                  description: "Nomes dos cargos para os quais este curso é APENAS RECOMENDADO (não obrigatório), separados por vírgula."
                }
              },
              required: ["nome", "descricao", "obrigatorios", "recomendados"]
            }
          }
        }
      });

      let rawList: any[] = [];
      try {
        let text = response.text || "[]";
        text = text.trim();
        if (text.startsWith("```json")) {
          text = text.substring(7);
        }
        if (text.startsWith("```")) {
          text = text.substring(3);
        }
        if (text.endsWith("```")) {
          text = text.substring(0, text.length - 3);
        }
        text = text.trim();
        rawList = JSON.parse(text);
      } catch (e) {
        console.error("Erro ao analisar JSON de cursos em massa:", e, response.text);
        throw new Error("Resposta do Gemini não pôde ser analisada como um JSON válido de cursos.");
      }

      const availableCargos = [
        "Supervisor(a)",
        "Coordenador(a)",
        "Gerente",
        "Enfermeiro(a)",
        "Tec. Enf.",
        "Aux. Enf.",
        "Administrativo",
        "Estagiária",
        "Outros"
      ];

      const processedList = rawList.map((item: any) => {
        const targets: any[] = [];
        
        // Split lists by commas or semicolons
        const obrsRaw = item.obrigatorios 
          ? item.obrigatorios.split(/[,;]/).map((s: string) => s.trim()) 
          : [];
        const recsRaw = item.recomendados 
          ? item.recomendados.split(/[,;]/).map((s: string) => s.trim()) 
          : [];

        const findMatchedCargo = (name: string) => {
          const lowerName = name.toLowerCase().replace(/[\(]a[\)]/g, 'a').replace(/ supervisor/g, 'supervisor');
          return availableCargos.find(c => {
            const cleanC = c.toLowerCase().replace(/[\(]a[\)]/g, 'a');
            return cleanC === lowerName || cleanC.includes(lowerName) || lowerName.includes(cleanC);
          });
        };

        // If the LLM returns "todos" or "todas"
        const isObrigatorioParaTodos = obrsRaw.some((s: string) => {
          const sLower = s.toLowerCase();
          return sLower === "todos" || sLower === "todos os cargos" || sLower === "toda a enfermagem" || sLower === "todas as categorias";
        });

        if (isObrigatorioParaTodos) {
          availableCargos.forEach(cargo => {
            targets.push({ cargo, obrigatorio: true });
          });
        } else {
          obrsRaw.forEach((cargoStr: string) => {
            if (!cargoStr) return;
            const matched = findMatchedCargo(cargoStr);
            if (matched) {
              targets.push({ cargo: matched, obrigatorio: true });
            }
          });

          recsRaw.forEach((cargoStr: string) => {
            if (!cargoStr) return;
            const matched = findMatchedCargo(cargoStr);
            if (matched && !targets.some(t => t.cargo === matched)) {
              targets.push({ cargo: matched, obrigatorio: false });
            }
          });
        }

        // Fallback: if targets is empty, make it recommended for all
        if (targets.length === 0) {
          availableCargos.forEach(cargo => {
            targets.push({ cargo, obrigatorio: false });
          });
        }

        return {
          nome: item.nome || "Curso sem nome",
          descricao: item.descricao || "Sem descrição disponível.",
          targets
        };
      });

      res.json(processedList);
    } catch (error: any) {
      console.error("Erro ao extrair lista de cursos em massa via Gemini:", error);
      res.status(500).json({
        error: "Erro ao processar o cadastro em massa de cursos via IA.",
        details: error.message || String(error)
      });
    }
  });


  // Hot Reload and Dev Server integrations or Static serving in production
  if (process.env.NODE_ENV !== "production") {
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
