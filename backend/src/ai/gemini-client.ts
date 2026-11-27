import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenAI,
  type Content,
  type FunctionCallingConfigMode,
  type FunctionDeclaration,
  type FunctionCall,
  type GenerateContentResponse,
  type Part,
} from '@google/genai';

export interface GenerateWithToolsParams {
  systemInstruction: string;
  prompt: string;
  declarations: FunctionDeclaration[];
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  timeoutMs?: number;
  maxRounds?: number;
}

export interface GenerateWithToolsResult {
  text: string | null;
  toolsUsed: string[];
}

/**
 * UC-70/71 (shared AI layer): a thin Gemini wrapper.
 *
 * Contract: `generateText(prompt)` returns `string | null` — null on any
 * error or when the call exceeds the timeout. AI is never load-bearing
 * (BR-79): callers must treat null as "skip the AI part and continue".
 *
 * - Model comes from `GEMINI_MODEL` (the cheapest "flash" model), never
 *   hard-coded (AI rule 5).
 * - API key comes from `GEMINI_API_KEY` (backend-only, never `NEXT_PUBLIC_*`).
 * - Every call is raced against a short timer so a slow/hung model can't
 *   stall the request (AI rule 6, 4–5s).
 */
@Injectable()
export class GeminiClient {
  private static readonly TIMEOUT_MS = 5_000;
  private static readonly TOOLS_TIMEOUT_MS = 12_000;
  private static readonly TOOLS_MAX_ROUNDS = 3;
  private readonly logger = new Logger(GeminiClient.name);
  private client: GoogleGenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Lazily build the SDK client; null when no API key is configured. */
  private getClient(): GoogleGenAI | null {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — AI features will return null');
      return null;
    }
    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  async generateText(prompt: string): Promise<string | null> {
    const client = this.getClient();
    if (!client) return null;

    const model = this.config.get<string>('GEMINI_MODEL');
    if (!model) {
      this.logger.warn('GEMINI_MODEL not set — AI features will return null');
      return null;
    }

    try {
      const raced = await this.raceWithTimeout(
        client.models.generateContent({ model, contents: prompt }),
        GeminiClient.TIMEOUT_MS,
      );
      if (raced.timedOut) {
        this.logger.warn(
          `Gemini call exceeded ${GeminiClient.TIMEOUT_MS}ms — skipping AI part`,
        );
        return null;
      }
      const text = raced.value.text?.trim();
      return text ? text : null;
    } catch (error) {
      this.logger.warn(
        `Gemini call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async generateWithTools(
    params: GenerateWithToolsParams,
  ): Promise<GenerateWithToolsResult> {
    const {
      systemInstruction,
      prompt,
      declarations,
      executeTool,
      timeoutMs = GeminiClient.TOOLS_TIMEOUT_MS,
      maxRounds = GeminiClient.TOOLS_MAX_ROUNDS,
    } = params;

    const client = this.getClient();
    if (!client) return { text: null, toolsUsed: [] };

    const model = this.config.get<string>('GEMINI_MODEL');
    if (!model) {
      this.logger.warn('GEMINI_MODEL not set — AI features will return null');
      return { text: null, toolsUsed: [] };
    }

    const budgetMs = Math.max(1, timeoutMs);
    const deadline = Date.now() + budgetMs;
    const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
    const toolsUsed: string[] = [];
    const seenTools = new Set<string>();
    const boundedRounds = Math.max(0, Math.floor(maxRounds));

    try {
      for (let round = 0; round <= boundedRounds; round++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          this.logger.warn(
            `Gemini tool call exceeded ${budgetMs}ms — returning null`,
          );
          return { text: null, toolsUsed };
        }

        const isFinalSynthesisRound = round === boundedRounds;
        const raced = await this.raceWithTimeout<GenerateContentResponse>(
          client.models.generateContent({
            model,
            contents: [...contents],
            config: {
              systemInstruction,
              ...(declarations.length > 0
                ? { tools: [{ functionDeclarations: declarations }] }
                : {}),
              ...(isFinalSynthesisRound &&
              boundedRounds > 0 &&
              declarations.length > 0
                ? {
                    toolConfig: {
                      functionCallingConfig: {
                        mode: 'NONE' as FunctionCallingConfigMode,
                      },
                    },
                  }
                : {}),
            },
          }),
          remaining,
        );

        if (raced.timedOut) {
          this.logger.warn(
            `Gemini tool call exceeded ${budgetMs}ms — returning null`,
          );
          return { text: null, toolsUsed };
        }

        const response = raced.value;
        const calls: FunctionCall[] = response.functionCalls ?? [];
        if (calls.length === 0 || isFinalSynthesisRound) {
          const text = response.text?.trim();
          return { text: text ? text : null, toolsUsed };
        }

        const candidateParts = response.candidates?.[0]?.content?.parts;
        const modelParts: Part[] =
          Array.isArray(candidateParts) &&
          candidateParts.some((part) => Boolean(part.functionCall))
            ? candidateParts
            : calls.map((functionCall) => ({ functionCall }));

        contents.push({ role: 'model', parts: modelParts });

        const responseParts: Part[] = [];
        for (const call of calls) {
          const name = typeof call.name === 'string' ? call.name.trim() : '';
          if (!name) continue;
          if (!seenTools.has(name)) {
            seenTools.add(name);
            toolsUsed.push(name);
          }

          let toolResult: Record<string, unknown>;
          try {
            const toolRemaining = deadline - Date.now();
            if (toolRemaining <= 0) {
              this.logger.warn(
                `Gemini tool call exceeded ${budgetMs}ms before ${name} — returning null`,
              );
              return { text: null, toolsUsed };
            }
            const toolRaced = await this.raceWithTimeout(
              executeTool(name, call.args ?? {}),
              toolRemaining,
            );
            if (toolRaced.timedOut) {
              this.logger.warn(
                `Gemini tool "${name}" exceeded ${budgetMs}ms — returning null`,
              );
              return { text: null, toolsUsed };
            }
            toolResult = toolRaced.value;
          } catch (error) {
            this.logger.warn(
              `Gemini tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            toolResult = { error: 'tool_failed' };
          }

          responseParts.push({
            functionResponse: {
              ...(call.id ? { id: call.id } : {}),
              name,
              response: toolResult,
            },
          });
        }

        if (responseParts.length === 0) {
          const text = response.text?.trim();
          return { text: text ? text : null, toolsUsed };
        }

        contents.push({ role: 'user', parts: responseParts });
      }

      return { text: null, toolsUsed };
    } catch (error) {
      this.logger.warn(
        `Gemini tool call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { text: null, toolsUsed };
    }
  }

  private async raceWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    });
    try {
      return await Promise.race([
        promise.then((value) => ({ timedOut: false as const, value })),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
