// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs } from "firebase/firestore";
import { GoogleGenAI, Type } from "@google/genai";
async function startServer() {
  const app = express();
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));
  const rawPort = process.env.PORT;
  const PORT = rawPort && !isNaN(Number(rawPort)) ? Number(rawPort) : rawPort || 3e3;
  app.use(express.json({ limit: "20mb" }));
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  let db = null;
  if (fs.existsSync(firebaseConfigPath)) {
    try {
      const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
      if (firebaseConfig && firebaseConfig.apiKey) {
        const firebaseApp = initializeApp(firebaseConfig);
        db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || void 0);
        console.log("[Firebase Backend] Conectado ao banco Firestore com sucesso.");
      }
    } catch (err) {
      console.error("[Firebase Backend Error] Falha ao ler ou conectar:", err);
    }
  }
  let geminiClient = null;
  const getGeminiClient = () => {
    if (!geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("A vari\xE1vel de ambiente GEMINI_API_KEY n\xE3o foi configurada.");
      }
      geminiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }
    return geminiClient;
  };
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Enfermagem HNSR server active." });
  });
  app.post("/api/cid10/search", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "O par\xE2metro 'query' de pesquisa \xE9 obrigat\xF3rio." });
      }
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Encontre os c\xF3digos de CID-10 (Classifica\xE7\xE3o Internacional de Doen\xE7as v10) mais prov\xE1veis e pertinentes para a seguinte busca em portugu\xEAs relacionado a atestados e sa\xFAde: "${query}". Retorne m\xFAltiplas op\xE7\xF5es l\xF3gicas (c\xF3digo oficial exacto, descri\xE7\xE3o correta e nota cl\xEDnica para enfermagem).`,
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
                    codigo: { type: Type.STRING, description: "C\xF3digo oficial da doen\xE7a no CID-10 (Ex: G43.9, B34.2, Z76.2)" },
                    descricao: { type: Type.STRING, description: "Descri\xE7\xE3o ou nome oficial da condi\xE7\xE3o em portugu\xEAs brasileiro" },
                    detalhes: { type: Type.STRING, description: "Breve explica\xE7\xE3o sobre os sintomas comuns, diagn\xF3stico ou indica\xE7\xE3o \xFAtil" }
                  },
                  required: ["codigo", "descricao", "detalhes"]
                }
              }
            },
            required: ["results"]
          }
        }
      });
      const text = response.text || '{"results":[]}';
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Erro na busca de CID-10 via Gemini:", error);
      res.status(500).json({
        error: "Erro ao processar a pesquisa de CID-10 via IA.",
        details: error.message || String(error)
      });
    }
  });
  app.post("/api/absenteismo/extract", async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body;
      if (!fileBase64 || !mimeType) {
        return res.status(400).json({ error: "Par\xE2metros 'fileBase64' e 'mimeType' s\xE3o obrigat\xF3rios." });
      }
      let cleanBase64 = fileBase64;
      if (fileBase64.includes(";base64,")) {
        cleanBase64 = fileBase64.split(";base64,").pop();
      }
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64
            }
          },
          {
            text: `Examine este documento em anexo (pode ser uma foto, escaneamento ou PDF de um atestado m\xE9dico) e extraia os campos cruciais para o preenchimento de absente\xEDsmo. 
Retorne as informa\xE7\xF5es estritamente estruturadas no formato JSON especificado. 
Seja preciso e busque nos textos leg\xEDveis do atestado. Se algum campo n\xE3o for encontrado, responda com string vazia ou o valor de default descrito.`
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
                description: "Data de in\xEDcio do repouso/afastamento no formato YYYY-MM-DD. Se n\xE3o for expl\xEDcito, assuma a data de emiss\xE3o do atestado."
              },
              duracao_dias: {
                type: Type.INTEGER,
                description: "Quantidade de dias de afastamento (inteiro maior ou igual a 1). Se estiver em horas, converta para dias arredondando para cima (ex: 12h ou 24h = 1 dia)."
              },
              cid: {
                type: Type.STRING,
                description: "C\xF3digo CID-10 identificado (ex: M54.5, A09, Z76.3). Retorne apenas o c\xF3digo limpo, sem pontos ou espa\xE7os adicionais se poss\xEDvel, ou retorne em formato padr\xE3o. Caso n\xE3o possua CID escrito, retorne string vazia."
              },
              patologia_diagnostico: {
                type: Type.STRING,
                description: "Descri\xE7\xE3o r\xE1pida ou diagn\xF3stico/sintomas descritos no atestado (ex: gastroenterite, lombalgia, etc.)."
              },
              medico_nome: {
                type: Type.STRING,
                description: "Nome completo do m\xE9dico emissor."
              }
            },
            required: ["colaborador_nome_original", "data_inicio", "duracao_dias"]
          }
        }
      });
      const text = response.text || "{}";
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Erro na extra\xE7\xE3o do atestado via Gemini:", error);
      res.status(500).json({
        error: "Erro ao analisar o atestado m\xE9dico via Intelig\xEAncia Artificial.",
        details: error.message || String(error)
      });
    }
  });
  app.post("/api/webhook/whatsapp", async (req, res) => {
    try {
      console.log("[WhatsApp Webhook] Recebida nova requisi\xE7\xE3o:", req.body);
      const senderRaw = req.body.From || req.body.sender || req.body.phone || "";
      const messageBody = req.body.Body || req.body.text || req.body.message || "";
      const isTwilio = !!(req.body.From && req.body.AccountSid);
      const cleanSender = senderRaw.replace(/\D/g, "");
      if (!senderRaw) {
        return res.status(400).json({ error: "Faltando par\xE2metro do remetente (From/sender/phone)." });
      }
      let colaboradoresList = [];
      if (db) {
        try {
          const colRef = collection(db, "colaboradores");
          const snap = await getDocs(colRef);
          snap.forEach((doc2) => {
            colaboradoresList.push({ ...doc2.data(), id: doc2.id });
          });
        } catch (dbErr) {
          console.error("Erro ao obter colaboradores em Firestore para WhatsApp:", dbErr);
        }
      }
      let matchedColab = colaboradoresList.find((c) => {
        if (!c.whatsapp) return false;
        const cleanColab = c.whatsapp.replace(/\D/g, "");
        return cleanColab.includes(cleanSender) || cleanSender.includes(cleanColab);
      });
      let fileBase64 = req.body.fileBase64 || "";
      let mimeType = req.body.mimeType || "image/jpeg";
      const mediaUrl = req.body.MediaUrl0 || req.body.mediaUrl || "";
      if (mediaUrl) {
        try {
          console.log("[WhatsApp Webhook] Baixando m\xEDdia do URL:", mediaUrl);
          const fileRes = await fetch(mediaUrl);
          const arrayBuf = await fileRes.arrayBuffer();
          fileBase64 = Buffer.from(arrayBuf).toString("base64");
          mimeType = fileRes.headers.get("content-type") || "image/jpeg";
        } catch (dlErr) {
          console.error("[WhatsApp Webhook] Erro ao baixar anexos do URL:", dlErr.message);
        }
      }
      let parsedAI = null;
      let aiExtractionAttempted = false;
      if (fileBase64) {
        try {
          aiExtractionAttempted = true;
          let cleanBase64 = fileBase64;
          if (fileBase64.includes(";base64,")) {
            cleanBase64 = fileBase64.split(";base64,").pop();
          }
          const client = getGeminiClient();
          const aiResponse = await client.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              {
                inlineData: { mimeType, data: cleanBase64 }
              },
              {
                text: "Analise o atestado m\xE9dico anexo e identifique: colaborador_nome_original, data_inicio (YYYY-MM-DD), duracao_dias (inteiro igual ou maior a 1) e c\xF3digo CID-10, patologia_diagnostico."
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
          console.log("[WhatsApp Webhook] Extra\xE7\xE3o conclu\xEDda com sucesso:", parsedAI);
        } catch (aiErr) {
          console.error("[WhatsApp Webhook] Erro na an\xE1lise Gemini:", aiErr);
        }
      }
      if (!matchedColab && parsedAI && parsedAI.colaborador_nome_original) {
        const cleanExtracted = parsedAI.colaborador_nome_original.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        matchedColab = colaboradoresList.find((c) => {
          const cleanName = c.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return cleanName.includes(cleanExtracted) || cleanExtracted.includes(cleanName);
        });
      }
      let replyMsg = "";
      if (parsedAI) {
        const onsetDate = parsedAI.data_inicio || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const formattedDate = onsetDate.split("-").reverse().join("/");
        const totalDays = parsedAI.duracao_dias || 1;
        const diseaseCid = (parsedAI.cid || "").trim().toUpperCase();
        const diseaseDesc = parsedAI.patologia_diagnostico || "Motivo M\xE9dico";
        if (matchedColab) {
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
              criadoEm: (/* @__PURE__ */ new Date()).toISOString(),
              origem: "WhatsApp Webhook"
            };
            await setDoc(doc(db, "absenteismo", documentId), newAbsItem);
            console.log("[WhatsApp Webhook] Atestado salvo no Firestore para o colaborador:", matchedColab.nome);
          }
          replyMsg = `Ol\xE1, *${matchedColab.nome}*! \u{1F3E5}

Recebemos a foto do seu atestado m\xE9dico. A nossa Intelig\xEAncia Artificial j\xE1 identificou os dados e registrou seu afastamento com sucesso!

\u{1F4C5} *In\xEDcio*: ${formattedDate}
\u23F3 *Dura\xE7\xE3o*: ${totalDays} dia(s)
\u{1FA7A} *CID*: ${diseaseCid || "N\xE3o especificado"}
\u{1F52C} *Patologia*: ${diseaseDesc}

O painel de escalas do *Hospital Nossa Senhora do Ros\xE1rio* foi atualizado automaticamente. Melhore logo! \u2764\uFE0F`;
        } else {
          replyMsg = `Ol\xE1! Recebemos e analisamos o atestado m\xE9dico, mas n\xE3o conseguimos localizar o seu n\xFAmero ou o nome de paciente *"${parsedAI.colaborador_nome_original}"* em nosso cadastro de enfermagem.

Ficha Extra\xEDda:
\u{1F4C5} *Afastamento*: ${totalDays} dia(s) a partir de ${formattedDate}
\u{1FA7A} *CID*: ${diseaseCid}

Por favor, acesse o painel das escalas para cadastrar seu n\xFAmero ou regularizar o atestado com seu gestor de enfermagem.`;
        }
      } else {
        if (matchedColab) {
          replyMsg = `Ol\xE1, *${matchedColab.nome}*! \u{1F44B}

Recebemos sua mensagem no canal de escalas do *Hospital Nossa Senhora do Ros\xE1rio*.

Para enviar um atestado, por favor envie uma **imagem leg\xEDvel (foto)** ou um arquivo **PDF** do atestado. Nossa Intelig\xEAncia Artificial cuidar\xE1 do preenchimento para voc\xEA!`;
        } else {
          replyMsg = `Ol\xE1! Seja bem-vindo ao portal de Escalas e Absente\xEDsmo do *Hospital Nossa Senhora do Ros\xE1rio*! \u{1F3E5}

N\xE3o conseguimos reconhecer seu n\xFAmero. Para registrar um atestado:
1. Certifique-se de que seu celular est\xE1 cadastrado em sua ficha.
2. Envie uma foto leg\xEDvel ou PDF do atestado m\xE9dico para que nossa IA fa\xE7a a leitura autom\xE1tica.`;
        }
      }
      if (isTwilio) {
        res.setHeader("Content-Type", "text/xml");
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyMsg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>
</Response>`;
        res.status(200).send(twiml);
      } else {
        res.status(200).json({
          success: true,
          matchedColaborador: matchedColab ? matchedColab.nome : null,
          extracted: parsedAI,
          replyText: replyMsg
        });
      }
    } catch (whErr) {
      console.error("[WhatsApp Webhook Error]:", whErr);
      res.status(500).json({
        success: false,
        error: "Erro no processamento do webhook de WhatsApp.",
        details: whErr.message || String(whErr)
      });
    }
  });
  app.post("/api/absenteismo/extract-text-list", async (req, res) => {
    try {
      const { textContent } = req.body;
      if (!textContent || !textContent.trim()) {
        return res.status(400).json({ error: "O par\xE2metro 'textContent' n\xE3o pode estar vazio." });
      }
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            text: `Voc\xEA \xE9 um assistente de gest\xE3o hospitalar. Analise o seguinte texto (que pode ser a c\xF3pia de uma conversa de grupo de WhatsApp de gestores, o corpo de um e-mail de justificativa, uma descri\xE7\xE3o de pasta compartilhada do OneDrive, ou uma lista digitada livremente) e identifique TODOS OS ATESTADOS M\xC9DICOS mencionados.

Texto para an\xE1lise:
"""
${textContent}
"""

Extraia as informa\xE7\xF5es e responda estritamente com o JSON contendo uma lista de objetos. Se nenhum atestado/afastamento for identificado, retorne uma lista vazia.

Gere apenas o vetor JSON v\xE1lido, seguindo o esquema abaixo. Caso a data de in\xEDcio n\xE3o esteja expl\xEDcita, assuma o dia corrente (hoje \xE9 ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}).`
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
                  description: "Data de in\xEDcio do repouso no formato YYYY-MM-DD."
                },
                duracao_dias: {
                  type: Type.INTEGER,
                  description: "Quantidade de dias de afastamento (inteiro maior ou igual a 1). Se estiver em horas, converta para dias (ex: 24h = 1 dia)."
                },
                cid: {
                  type: Type.STRING,
                  description: "C\xF3digo CID-10 identificado (ex: M545, A09, Z76). Deixe vazio se n\xE3o tiver."
                },
                patologia_diagnostico: {
                  type: Type.STRING,
                  description: "Descri\xE7\xE3o da queixa ou diagn\xF3stico se houver."
                }
              },
              required: ["colaborador_nome_original", "data_inicio", "duracao_dias"]
            }
          }
        }
      });
      const text = response.text || "[]";
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Erro na extra\xE7\xE3o de texto em lote via Gemini:", error);
      res.status(500).json({
        error: "Erro ao analisar o texto enviado via Intelig\xEAncia Artificial.",
        details: error.message || String(error)
      });
    }
  });
  app.post("/api/universidade/extract", async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body;
      if (!fileBase64 || !mimeType) {
        return res.status(400).json({ error: "Par\xE2metros 'fileBase64' e 'mimeType' s\xE3o obrigat\xF3rios." });
      }
      let cleanBase64 = fileBase64;
      if (fileBase64.includes(";base64,")) {
        cleanBase64 = fileBase64.split(";base64,").pop();
      }
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64
            }
          },
          {
            text: `Você é um sistema especialista em OCR e processamento de documentos hospitalares, focado em ler certificados da Universidade Corporativa Hapvida.
Sua tarefa é analisar a imagem ou PDF do certificado de conclusão de curso anexado e extrair as seguintes informações com máxima precisão:

1. NOME COMPLETO DO COLABORADOR (Aluno/Beneficiário):
   - Localize o nome do profissional de saúde que concluiu o treinamento.
   - No padrão Hapvida, ele aparece em destaque e em tamanho maior, logo abaixo do cabeçalho de "CERTIFICAMOS QUE".
   - No certificado anexado, o nome do aluno é "Michel Milk Fougaca" (ou nome correspondente de outro colaborador).
   - IGNORE COMPLETAMENTE e NUNCA extraia os nomes de gestores ou diretores que assinam o certificado no final, tais como: "Claudia Perez" (Gerente de Educação Corporativa) ou "Andrea Baldin" (Gerente de Educação Corporativa Assistencial).

2. NOME DO CURSO OU CAPACITAÇÃO:
   - Identifique o título exato do curso que está destacado entre aspas duplas após a frase "Concluiu o treinamento" ou similar.
   - Exemplos do padrão:
     - "Assédio e Discriminação"
     - "Gerenciamento de Resíduos - 2026"
     - "Guia de Boas Práticas: Uso e Remoção Segura de Hypafix®"
     - "Integridade e Compliance - 2026"
   - Retorne o nome completo exatamente como está dentro das aspas (ex: "Guia de Boas Práticas: Uso e Remoção Segura de Hypafix®" ou "Gerenciamento de Resíduos - 2026").

3. DATA DE CONCLUSÃO:
   - Extraia a data em que o treinamento foi finalizado, que vem escrita por extenso no final da frase de conclusão.
   - Exemplos:
     - "... no dia \"22 de agosto de 2025\"." -> Extrair "22 de agosto de 2025" e converter para "2025-08-22".
     - "... no dia \"26 de abril de 2026\"." -> Extrair "26 de abril de 2026" e converter para "2026-04-26".
     - "... em \"26 de abril de 2026\"." -> Extrair "26 de abril de 2026" e converter para "2026-04-26".
     - "... no dia \"20 de abril de 2026\"." -> Extrair "20 de abril de 2026" e converter para "2026-04-20".
   - Mapeamento de meses em português para números:
     - janeiro = 01, fevereiro = 02, março = 03, abril = 04, maio = 05, junho = 06,
     - julho = 07, agosto = 08, setembro = 09, outubro = 10, novembro = 11, dezembro = 12.
   - Converta obrigatoriamente para o formato ISO padrão: YYYY-MM-DD.

Seja extremamente rigoroso na extração para evitar falsos positivos ou confundir o nome do aluno com o do emissor do certificado. Retorne as informações estruturadas no formato JSON especificado.`
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              colaborador_nome_original: {
                type: Type.STRING,
                description: "Nome completo do aluno/colaborador/profissional da sa\xFAde beneficiado pelo certificado."
              },
              curso_nome: {
                type: Type.STRING,
                description: "T\xEDtulo ou nome de capacita\xE7\xE3o do curso conclu\xEDdo (ex: Suporte Avan\xE7ado de Vida, Brigada, \xC9tica, NR32, etc.)."
              },
              data_conclusao: {
                type: Type.STRING,
                description: "Data em que o curso foi finalizado ou o certificado emitido, formato YYYY-MM-DD."
              }
            },
            required: ["colaborador_nome_original", "curso_nome", "data_conclusao"]
          }
        }
      });
      const text = response.text || "{}";
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Erro na extra\xE7\xE3o do certificado da universidade corporativa via Gemini:", error);
      res.status(500).json({
        error: "Erro ao analisar o certificado via Intelig\xEAncia Artificial.",
        details: error.message || String(error)
      });
    }
  });
  app.post("/api/universidade/extract-text-list", async (req, res) => {
    try {
      const { textContent } = req.body;
      if (!textContent || !textContent.trim()) {
        return res.status(400).json({ error: "O par\xE2metro 'textContent' n\xE3o pode estar vazio." });
      }
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            text: `Voc\xEA \xE9 um assistente de gest\xE3o de universidade corporativa hospitalar. Analise o seguinte texto (que pode ser a c\xF3pia de uma conversa de WhatsApp, notas de reuni\xF5es, comprovantes de conclus\xE3o, ou uma lista digitada livremente) e identifique TODOS OS CURSOS E CERTIFICADOS conclu\xEDdos e reportados pelos profissionais de enfermagem.

Texto para an\xE1lise:
"""
${textContent}
"""

Extraia as informa\xE7\xF5es e responda estritamente com o JSON contendo uma lista de objetos. Se nada for identificado, retorne uma lista vazia.

Gere apenas o vetor JSON v\xE1lido compat\xEDvel com o esquema abaixo. Caso a data de conclus\xE3o n\xE3o esteja expl\xEDcita, use o dia atual (${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}).`
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
                  description: "Nome ou t\xEDtulo do curso ou treinamento realizado."
                },
                data_conclusao: {
                  type: Type.STRING,
                  description: "Data de conclus\xE3o ou homologa\xE7\xE3o no formato YYYY-MM-DD."
                }
              },
              required: ["colaborador_nome_original", "curso_nome", "data_conclusao"]
            }
          }
        }
      });
      const text = response.text || "[]";
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Erro ao extrair texto de certificados via Gemini:", error);
      res.status(500).json({
        error: "Erro ao processar as conclus\xF5es de cursos enviadas via IA.",
        details: error.message || String(error)
      });
    }
  });
  app.post("/api/universidade/extract-courses-bulk", async (req, res) => {
    try {
      const { textContent } = req.body;
      if (!textContent || !textContent.trim()) {
        return res.status(400).json({ error: "O par\xE2metro 'textContent' n\xE3o pode estar vazio." });
      }
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            text: `Voc\xEA \xE9 um gestor de universidade corporativa em um hospital de alta complexidade.
Sua miss\xE3o \xE9 ler o texto fornecido pelo usu\xE1rio contendo solicita\xE7\xF5es de novos cursos ou um planejamento de treinamentos, identificar cada curso que deve ser criado, e determinar para quais cargos de enfermagem e sa\xFAde o curso deve ser direcionado (marcando se \xE9 obrigat\xF3rio ou recomendado).

Cargos dispon\xEDveis no sistema (use EXATAMENTE estes nomes na propriedade 'obrigatorios' ou 'recomendados' como uma lista separada por v\xEDrgula):
- "Supervisor(a)"
- "Coordenador(a)"
- "Gerente"
- "Enfermeiro(a)"
- "Tec. Enf."
- "Aux. Enf."
- "Administrativo"
- "Estagi\xE1ria"
- "Outros"

Se o curso for obrigat\xF3rio para todos, preencha a propriedade 'obrigatorios' com todos esses cargos listados acima.

Texto para an\xE1lise:
"""
${textContent}
"""

Extraia os cursos e seus respectivos p\xFAblicos-alvo de acordo com o texto ou a melhor pr\xE1tica hospitalar caso o texto n\xE3o seja totalmente expl\xEDcito sobre a obrigatoriedade. Responda estritamente com o JSON contendo uma lista de objetos. Se nada for identificado, retorne uma lista vazia.`
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
                  description: "Nome ou t\xEDtulo do curso/treinamento."
                },
                descricao: {
                  type: Type.STRING,
                  description: "Ementa, descri\xE7\xE3o ou objetivo do treinamento."
                },
                obrigatorios: {
                  type: Type.STRING,
                  description: "Nomes dos cargos para os quais este curso \xE9 OBRIGAT\xD3RIO, separados por v\xEDrgula. Ex: 'Enfermeiro(a), Supervisor(a)'"
                },
                recomendados: {
                  type: Type.STRING,
                  description: "Nomes dos cargos para os quais este curso \xE9 APENAS RECOMENDADO (n\xE3o obrigat\xF3rio), separados por v\xEDrgula."
                }
              },
              required: ["nome", "descricao", "obrigatorios", "recomendados"]
            }
          }
        }
      });
      let rawList = [];
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
        throw new Error("Resposta do Gemini n\xE3o p\xF4de ser analisada como um JSON v\xE1lido de cursos.");
      }
      const availableCargos = [
        "Supervisor(a)",
        "Coordenador(a)",
        "Gerente",
        "Enfermeiro(a)",
        "Tec. Enf.",
        "Aux. Enf.",
        "Administrativo",
        "Estagi\xE1ria",
        "Outros"
      ];
      const processedList = rawList.map((item) => {
        const targets = [];
        const obrsRaw = item.obrigatorios ? item.obrigatorios.split(/[,;]/).map((s) => s.trim()) : [];
        const recsRaw = item.recomendados ? item.recomendados.split(/[,;]/).map((s) => s.trim()) : [];
        const findMatchedCargo = (name) => {
          const lowerName = name.toLowerCase().replace(/[\(]a[\)]/g, "a").replace(/ supervisor/g, "supervisor");
          return availableCargos.find((c) => {
            const cleanC = c.toLowerCase().replace(/[\(]a[\)]/g, "a");
            return cleanC === lowerName || cleanC.includes(lowerName) || lowerName.includes(cleanC);
          });
        };
        const isObrigatorioParaTodos = obrsRaw.some((s) => {
          const sLower = s.toLowerCase();
          return sLower === "todos" || sLower === "todos os cargos" || sLower === "toda a enfermagem" || sLower === "todas as categorias";
        });
        if (isObrigatorioParaTodos) {
          availableCargos.forEach((cargo) => {
            targets.push({ cargo, obrigatorio: true });
          });
        } else {
          obrsRaw.forEach((cargoStr) => {
            if (!cargoStr) return;
            const matched = findMatchedCargo(cargoStr);
            if (matched) {
              targets.push({ cargo: matched, obrigatorio: true });
            }
          });
          recsRaw.forEach((cargoStr) => {
            if (!cargoStr) return;
            const matched = findMatchedCargo(cargoStr);
            if (matched && !targets.some((t) => t.cargo === matched)) {
              targets.push({ cargo: matched, obrigatorio: false });
            }
          });
        }
        if (targets.length === 0) {
          availableCargos.forEach((cargo) => {
            targets.push({ cargo, obrigatorio: false });
          });
        }
        return {
          nome: item.nome || "Curso sem nome",
          descricao: item.descricao || "Sem descri\xE7\xE3o dispon\xEDvel.",
          targets
        };
      });
      res.json(processedList);
    } catch (error) {
      console.error("Erro ao extrair lista de cursos em massa via Gemini:", error);
      res.status(500).json({
        error: "Erro ao processar o cadastro em massa de cursos via IA.",
        details: error.message || String(error)
      });
    }
  });
  if (process.env.NODE_ENV !== "production" && process.env.DISABLE_HMR !== "true") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  if (typeof PORT === "number") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`Server running on socket path ${PORT}`);
    });
  }
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=server.js.map
