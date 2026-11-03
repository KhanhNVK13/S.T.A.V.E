import { ConfigService } from '@nestjs/config';
import { GeminiClient } from './gemini-client';

const generateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent },
  })),
}));

function buildClient(env: Record<string, string>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new GeminiClient(config);
}

describe('GeminiClient', () => {
  const env = { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' };

  beforeEach(() => generateContent.mockReset());

  it('returns null without an API key', async () => {
    await expect(
      buildClient({ GEMINI_MODEL: 'm' }).generateText('x'),
    ).resolves.toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('returns trimmed text without waiting for the timeout', async () => {
    generateContent.mockResolvedValue({ text: '  xin chào  ' });
    const start = Date.now();
    await expect(buildClient(env).generateText('x')).resolves.toBe('xin chào');
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('returns null when the model call throws', async () => {
    generateContent.mockRejectedValue(new Error('quota'));
    await expect(buildClient(env).generateText('x')).resolves.toBeNull();
  });

  it('returns null when the model hangs past the timeout', async () => {
    jest.useFakeTimers();
    generateContent.mockReturnValue(new Promise(() => undefined));
    const pending = buildClient(env).generateText('x');
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBeNull();
    jest.useRealTimers();
  });
});
