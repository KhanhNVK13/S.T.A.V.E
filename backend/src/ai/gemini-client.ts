import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

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

    const timer = new Promise<string | null>((resolve) =>
      setTimeout(() => resolve(null), GeminiClient.TIMEOUT_MS),
    );

    try {
      const [response] = await Promise.all([
        client.models.generateContent({ model, contents: prompt }),
        timer,
      ]);
      if (response === null) return null; // timed out
      const text = response.text?.trim();
      return text ? text : null;
    } catch (error) {
      this.logger.warn(
        `Gemini call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
