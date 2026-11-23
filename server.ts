import express from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { APP_CATEGORIES, OPERATION_TYPES } from './src/types.ts';
import {
  AiTimeoutError,
  ChatRequestSchema,
  ExtractedBoletoSchema,
  ExtractedDocBatchSchema,
  ParseBoletoRequestSchema,
  ParseDocumentSchema,
  SlidingWindowRateLimiter,
  isOriginAllowedForAi,
  sanitizeTextInput,
  withTimeout,
} from './src/server/aiGuard.ts';
import { createInvestmentRouter } from './server/routes/investmentRoutes.ts';

dotenv.config();

const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-4-hydrogen').trim();
const AI_RATE_LIMIT_PER_MIN = Math.max(5, Number(process.env.AI_RATE_LIMIT_PER_MIN) || 25);
const AI_REQUEST_TIMEOUT_MS = 25000;
const AI_OCR_TIMEOUT_MS = 55000;

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

const aiRateLimiter = new SlidingWindowRateLimiter(AI_RATE_LIMIT_PER_MIN, 60_000);

function isTransientAiError(err: unknown): boolean {
  if (err instanceof AiTimeoutError) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED')
  );
}

function formatAiErrorResponse(err: unknown): { status: number; message: string } {
  if (err instanceof AiTimeoutError) {
    return {
      status: 504,
      message: err.message,
    };
  }
  const msg = err instanceof Error ? err.message : 'Erro ao processar solicitação com IA.';
  if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message: 'O serviço de IA está temporariamente sobrecarregado (503). Tente novamente em alguns instantes.',
    };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Limite de requisições da IA atingido no momento (429). Aguarde alguns segundos e tente novamente.',
    };
  }
  if (
    msg.includes('INVALID_ARGUMENT') ||
    msg.includes('400') ||
    msg.includes('Unable to process input image') ||
    msg.includes('document has no pages')
  ) {
    return {
      status: 400,
      message: 'Arquivo PDF ou imagem inválido, protegido por senha ou ilegível para leitura visual.',
    };
  }
  return { status: 500, message: 'Não foi possível processar a análise no momento. Tente novamente.' };
}

async function generateWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  timeoutMs = AI_REQUEST_TIMEOUT_MS
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientAiError(err)) {
        const delayMs = 600 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function getClientIdentifier(req: express.Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown-client';
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Baseline security headers compatible with AI Studio iFrame embedding
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '24mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, aiConfigured: Boolean(ai), model: GEMINI_MODEL });
  });

  // Banco Central SGS 12 CDI history API with cache & validation
  app.use('/api/investments', createInvestmentRouter());

  // Security & quota protection middleware for all /api/ai/* routes
  app.use('/api/ai', (req, res, next) => {
    const allowedOrigin = isOriginAllowedForAi({
      origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      referer: typeof req.headers.referer === 'string' ? req.headers.referer : undefined,
      host: typeof req.headers.host === 'string' ? req.headers.host : undefined,
      forwardedHost:
        typeof req.headers['x-forwarded-host'] === 'string'
          ? req.headers['x-forwarded-host']
          : undefined,
    });

    if (!allowedOrigin) {
      return res.status(403).json({
        error: 'Origem não autorizada para acessar os serviços de Inteligência Artificial.',
      });
    }

    const requiredToken = process.env.AI_ACCESS_TOKEN?.trim();
    if (requiredToken) {
      const authHeader = req.headers.authorization || '';
      const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (provided !== requiredToken) {
        return res.status(401).json({ error: 'Autenticação necessária para usar o recurso de IA.' });
      }
    }

    const clientId = getClientIdentifier(req);
    const rate = aiRateLimiter.check(clientId);
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      return res.status(429).json({
        error: `Limite temporário de uso da IA atingido. Aguarde ${rate.retryAfterSec}s e tente novamente.`,
      });
    }

    next();
  });

  // AI Chat endpoint grounded in aggregated financial summary
  app.post('/api/ai/chat', async (req, res) => {
    const parsedBody = ChatRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ error: 'Dados inválidos na solicitação de chat.' });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Assistente de IA indisponível: configure GEMINI_API_KEY nos segredos do servidor.',
      });
    }

    try {
      const { prompt, summaryContext } = parsedBody.data;
      const cleanPrompt = sanitizeTextInput(prompt, 1500);
      if (!cleanPrompt) {
        return res.status(400).json({ error: 'Informe uma pergunta válida.' });
      }

      const systemInstruction =
        'Você é o assistente financeiro executivo do Sávio Finanças. ' +
        'Responda em português, de forma clara, objetiva e fundamentada EXCLUSIVAMENTE nos números agregados fornecidos abaixo. ' +
        'Nunca invente saldos, datas ou valores. Se faltar algum dado no resumo, informe claramente o que não consta.\n\n' +
        `Resumo financeiro do período (${summaryContext.period}, escopo ${summaryContext.scope}):\n` +
        JSON.stringify(summaryContext, null, 2);

      const response = await generateWithRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: cleanPrompt,
          config: {
            systemInstruction,
          },
        })
      );

      res.json({ reply: response.text || 'Não foi possível gerar uma resposta no momento.' });
    } catch (error: unknown) {
      const formatted = formatAiErrorResponse(error);
      console.error('AI Chat Error:', formatted.status);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // AI Multimodal Document Parser (PDF or Image -> Array of structured transactions validated by Zod)
  app.post('/api/ai/parse-document', async (req, res) => {
    const parsedBody = ParseDocumentSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ error: 'Envie um arquivo PDF/imagem válido (até 15 MB) ou texto para leitura.' });
    }

    if (!ai) {
      return res.status(503).json({
        error:
          'Leitor inteligente indisponível: configure GEMINI_API_KEY no servidor. Você ainda pode cadastrar manualmente.',
      });
    }

    try {
      const { textContent, fileName, fileData, knownAccounts } = parsedBody.data;
      const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];

      if (fileData) {
        let finalMime = fileData.mimeType;
        const lowName = (fileName || '').toLowerCase();
        if (lowName.endsWith('.pdf') || finalMime.includes('pdf')) {
          finalMime = 'application/pdf';
        } else if (lowName.endsWith('.png')) {
          finalMime = 'image/png';
        } else if (lowName.endsWith('.webp')) {
          finalMime = 'image/webp';
        } else if (lowName.endsWith('.jpg') || lowName.endsWith('.jpeg')) {
          finalMime = 'image/jpeg';
        } else if (finalMime === 'application/octet-stream' || !finalMime) {
          finalMime = 'application/pdf';
        }
        parts.push({
          inlineData: {
            mimeType: finalMime,
            data: fileData.base64,
          },
        });
      }

      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;
      const accountsText =
        knownAccounts && knownAccounts.length > 0
          ? knownAccounts
              .map(
                (a) =>
                  `- ${sanitizeTextInput(a.institutionName, 100)} (${sanitizeTextInput(
                    a.accountName,
                    100
                  )}) [${a.entityId}]`
              )
              .join('\n')
          : 'Nenhuma conta informada.';

      const cleanFileName = sanitizeTextInput(fileName || 'documento', 180);
      const cleanText = textContent ? sanitizeTextInput(textContent, 30000) : '';

      const instruction = `Extraia TODOS os lançamentos financeiros visíveis no documento/extrato/comprovante anexado (${cleanFileName}) no formato de array "transactions".
Regras obrigatórias:
1. Para cada lançamento, classifique "operationType" conforme as definições:
   - PIX: transferências ou pagamentos via Pix, chave Pix, QR Code Pix, ou com ID End-to-End (E...).
   - TED_DOC: transferências bancárias TED ou DOC entre bancos para terceiros.
   - BOLETO: pagamento de boletos, títulos bancários, guias DAS/DARF/GPS ou contas de consumo por código de barras.
   - CARTAO: compras no crédito ou débito, pagamento de fatura de cartão, lançamentos com bandeira/NSU.
   - TRANSFERENCIA_PROPRIA: transferência entre contas do mesmo titular (inclusive entre CPF e CNPJ do mesmo usuário, ou aplicações/resgates entre suas contas listadas abaixo).
   - SAQUE: retirada em dinheiro em caixa eletrônico / terminal de autoatendimento.
   - TARIFA: tarifas bancárias, IOF, anuidade, juros ou encargos financeiros.
   - OUTRO: qualquer operação que não se enquadre nos itens anteriores.
2. Classifique "category" EXCLUSIVAMENTE dentro desta lista exata: ${APP_CATEGORIES.join(', ')}. Use "Transferência" quando for TRANSFERENCIA_PROPRIA e "Outros" se nenhuma categoria específica servir.
3. Contas conhecidas do usuário:
${accountsText}
   Se tanto a origem quanto o destino corresponderem às contas do próprio usuário (ou houver menção de "mesma titularidade" entre contas próprias), defina operationType="TRANSFERENCIA_PROPRIA" e isInternalTransfer=true. Caso contrário, isInternalTransfer=false.
4. Preencha "counterparty" com o nome/razão social de quem pagou ou recebeu (se não visível, retorne string vazia "").
5. Preencha "externalId" com o ID da transação quando houver (ex.: ID E2E do Pix iniciado por E..., NSU ou código de autenticação; se não existir, retorne "").
6. Preencha "originAccountHint" e "destinationAccountHint" com banco/titular de origem e destino quando identificáveis (ou "").
7. Preencha "confidence" de 0.0 a 1.0 refletindo o grau de certeza na leitura dos campos e explique qualquer dúvida em "confidenceNote".
8. Nunca invente valores: se um valor estiver ilegível use 0 e reduza confidence; se a data estiver ilegível use ${today} e explique em confidenceNote.
${cleanText ? `\nTexto adicional:\n${cleanText}` : ''}`;

      parts.push({ text: instruction });

      const response = await generateWithRetry(
        () =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: { parts },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
              type: Type.OBJECT,
              properties: {
                transactions: {
                  type: Type.ARRAY,
                  description: 'Lista de todos os lançamentos financeiros extraídos do documento.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      description: { type: Type.STRING },
                      amount: { type: Type.NUMBER },
                      date: { type: Type.STRING, description: 'Data no formato YYYY-MM-DD' },
                      category: { type: Type.STRING, enum: [...APP_CATEGORIES] },
                      entity: { type: Type.STRING, enum: ['CPF', 'CNPJ'] },
                      direction: { type: Type.STRING, enum: ['INCOME', 'EXPENSE'] },
                      operationType: { type: Type.STRING, enum: [...OPERATION_TYPES] },
                      counterparty: { type: Type.STRING },
                      externalId: { type: Type.STRING },
                      isInternalTransfer: { type: Type.BOOLEAN },
                      originAccountHint: { type: Type.STRING },
                      destinationAccountHint: { type: Type.STRING },
                      confidence: { type: Type.NUMBER, description: 'Grau de confiança entre 0.0 e 1.0' },
                      confidenceNote: { type: Type.STRING },
                    },
                    required: [
                      'description',
                      'amount',
                      'date',
                      'category',
                      'entity',
                      'direction',
                      'operationType',
                      'counterparty',
                      'externalId',
                      'isInternalTransfer',
                      'confidence',
                    ],
                  },
                },
              },
              required: ['transactions'],
            },
          },
        }),
        2,
        AI_OCR_TIMEOUT_MS
      );

      const rawJson = JSON.parse((response.text ?? '{}').trim());
      const validated = ExtractedDocBatchSchema.safeParse(rawJson);
      if (!validated.success) {
        return res.status(422).json({
          error: 'Não foi possível validar os lançamentos extraídos do documento.',
        });
      }

      res.json({ transactions: validated.data.transactions });
    } catch (error: unknown) {
      const formatted = formatAiErrorResponse(error);
      console.error('Parse doc error:', formatted.status);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // AI Boleto Analyzer (Zod + Gemini Multimodal)
  app.post('/api/ai/parse-boleto', async (req, res) => {
    const parsedBody = ParseBoletoRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ error: 'Dados inválidos para análise de boleto.' });
    }

    if (!ai) {
      return res.status(503).json({
        error:
          'Análise por IA indisponível: configure GEMINI_API_KEY no servidor. A validação matemática da linha digitável continua funcionando.',
      });
    }

    try {
      const { linhaDigitavel, textContent, fileData } = parsedBody.data;
      const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
      if (fileData) {
        parts.push({ inlineData: { mimeType: fileData.mimeType, data: fileData.base64 } });
      }
      const cleanLine = linhaDigitavel ? sanitizeTextInput(linhaDigitavel, 120) : 'N/A';
      const cleanText = textContent ? sanitizeTextInput(textContent, 15000) : 'N/A';

      parts.push({
        text: `Analise o boleto bancário (linha digitável: ${cleanLine}; texto: ${cleanText}) e extraia beneficiário, pagador, instituição, linha digitável, vencimento (YYYY-MM-DD), valorOriginal, descrição e vínculo (CPF ou CNPJ). Nunca invente valores não presentes.`,
      });

      const response = await generateWithRetry(
        () =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: { parts },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  beneficiario: { type: Type.STRING },
                  pagador: { type: Type.STRING },
                  instituicao: { type: Type.STRING },
                  linhaDigitavel: { type: Type.STRING },
                  vencimento: { type: Type.STRING },
                  valorOriginal: { type: Type.NUMBER },
                  descricao: { type: Type.STRING },
                  entityId: { type: Type.STRING, enum: ['CPF', 'CNPJ'] },
                },
                required: ['beneficiario', 'pagador', 'instituicao', 'vencimento', 'valorOriginal', 'descricao', 'entityId'],
              },
            },
          }),
        2,
        AI_OCR_TIMEOUT_MS
      );

      const rawJson = JSON.parse((response.text ?? '{}').trim());
      const validated = ExtractedBoletoSchema.safeParse(rawJson);
      if (!validated.success) {
        return res.status(422).json({ error: 'Não foi possível validar os campos do boleto.' });
      }

      res.json({ boleto: validated.data });
    } catch (error: unknown) {
      const formatted = formatAiErrorResponse(error);
      console.error('Parse boleto error:', formatted.status);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Always return JSON errors for /api/* (e.g., PayloadTooLargeError 413 or malformed JSON 400)
  app.use(
    '/api',
    (
      err: { status?: number; statusCode?: number; type?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
        return res.status(413).json({
          error:
            'O arquivo enviado excede o limite de tamanho aceito pelo servidor de OCR (máximo 15 MB).',
        });
      }
      if (err?.type === 'entity.parse.failed' || err?.status === 400) {
        return res.status(400).json({ error: 'Corpo da requisição inválido ao enviar documento.' });
      }
      const status = err?.status || err?.statusCode || 500;
      return res.status(status).json({
        error: err?.message || 'Erro interno ao processar requisição na API.',
      });
    }
  );

  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist'))) {
    app.use(
      express.static(path.resolve('dist'), {
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith('index.html') ||
            filePath.endsWith('sw.js') ||
            filePath.endsWith('registerSW.js') ||
            filePath.endsWith('manifest.webmanifest')
          ) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sávio Finanças server running on port ${PORT} (model: ${GEMINI_MODEL})`);
  });
}

startServer();
