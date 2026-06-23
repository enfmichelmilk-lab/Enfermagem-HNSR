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
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
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
      });

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

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Você é um sistema especialista em OCR e processamento de documentos hospitalares.
Sua tarefa é analisar a imagem ou PDF do certificado de conclusão de curso anexado e extrair as seguintes informações com máxima precisão:

1. NOME COMPLETO DO COLABORADOR (Beneficiário):
   - Localize o nome do profissional de saúde que concluiu o treinamento.
   - Geralmente aparece após termos como: "Certificamos que", "conferido a", "concedido a", "outorgado a", "atribuído a", "aluno(a)", "ao(à) profissional".
   - IGNORE nomes de diretores, palestrantes, coordenadores, secretários ou professores que assinam o certificado (ex: "Diretor Geral", "Coordenador de Enfermagem", "Palestrante").
   - O nome deve vir limpo de cargos ou títulos anteriores/posteriores (ex: remova "Enf.", "Dr.", "Técnico(a)" se fizerem parte do preenchimento, retorne apenas o nome próprio).

2. NOME DO CURSO OU CAPACITAÇÃO:
   - Identifique o título exato do curso, treinamento, palestra ou capacitação realizado.
   - Costuma vir destacado em negrito, entre aspas, em fonte maior ou após palavras como: "concluiu o curso de", "participou do treinamento de", "na capacitação em", "no workshop".
   - Exemplos comuns no hospital: "Suporte Avançado de Vida (SAV)", "SAV", "Prevenção de Lesões por Pressão (LPP)", "LPP", "NR-32", "Segurança do Paciente", "Ética Profissional".

3. DATA DE CONCLUSÃO:
   - Extraia a data em que o treinamento foi finalizado ou o certificado foi emitido.
   - Procure por formatos como "DD/MM/AAAA", "AAAA-MM-DD", ou por extenso "XX de [Mês] de [Ano]" (ex: "23 de Junho de 2026").
   - Converta obrigatoriamente a data localizada para o formato ISO padrão: YYYY-MM-DD.
   - Caso nenhuma data de emissão ou conclusão seja localizada no documento inteiro, retorne a data atual padrão: "${new Date().toISOString().split("T")[0]}".

Seja extremamente rigoroso na extração para evitar falsos positivos ou trocar o nome do aluno pelo nome do emissor do certificado. Retorne as informações estruturadas no formato JSON especificado.`,
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
                description: "Título ou nome de capacitação do curso concluído (ex: Suporte Avançado de Vida, Brigada, Ética, NR32, etc.)." 
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

Cargos disponíveis no sistema (use EXATAMENTE estes nomes na propriedade 'cargo'):
- "Supervisor(a)"
- "Coordenador(a)"
- "Gerente"
- "Enfermeiro(a)"
- "Tec. Enf."
- "Aux. Enf."
- "Administrativo"
- "Estagiária"
- "Outros"

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
                targets: { 
                  type: Type.ARRAY,
                  description: "Lista de cargos alvo e suas respectivas obrigatoriedades.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      cargo: {
                        type: Type.STRING,
                        description: "O nome exato do cargo conforme os disponíveis."
                      },
                      obrigatorio: {
                        type: Type.BOOLEAN,
                        description: "Se o curso é obrigatório (true) ou apenas recomendado (false) para este cargo."
                      }
                    },
                    required: ["cargo", "obrigatorio"]
                  }
                }
              },
              required: ["nome", "descricao", "targets"]
            }
          }
        }
      });

      const text = response.text || "[]";
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Erro ao extrair lista de cursos em massa via Gemini:", error);
      res.status(500).json({
        error: "Erro ao processar o cadastro em massa de cursos via IA.",
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
