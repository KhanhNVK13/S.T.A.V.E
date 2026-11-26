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

describe('BE-AIX-02 GeminiClient', () => {
  const env = { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' };

  beforeEach(() => generateContent.mockReset());

  it('UTCID01 returns null without an API key', async () => {
    await expect(
      buildClient({ GEMINI_MODEL: 'm' }).generateText('x'),
    ).resolves.toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('UTCID02 returns trimmed text without waiting for the timeout', async () => {
    generateContent.mockResolvedValue({ text: '  xin chào  ' });
    const start = Date.now();
    await expect(buildClient(env).generateText('x')).resolves.toBe('xin chào');
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('UTCID03 returns null when the model call throws', async () => {
    generateContent.mockRejectedValue(new Error('quota'));
    await expect(buildClient(env).generateText('x')).resolves.toBeNull();
  });

  it('UTCID04 returns null when the model hangs past the timeout', async () => {
    jest.useFakeTimers();
    generateContent.mockReturnValue(new Promise(() => undefined));
    const pending = buildClient(env).generateText('x');
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBeNull();
    jest.useRealTimers();
  });
});

describe('GeminiClient.generateWithTools', () => {
  const env = { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.5-flash' };
  const declarations = [
    { name: 'list_branches', description: 'List branches' },
    { name: 'get_theory_range', description: 'Get theory' },
  ];

  beforeEach(() => {
    generateContent.mockReset();
    jest.useRealTimers();
  });

  it('returns null without calling the model when API key or model is missing', async () => {
    const executeTool = jest.fn();
    await expect(
      buildClient({ GEMINI_MODEL: 'm' }).generateWithTools({
        systemInstruction: 'sys',
        prompt: 'q',
        declarations,
        executeTool,
      }),
    ).resolves.toEqual({ text: null, toolsUsed: [] });

    await expect(
      buildClient({ GEMINI_API_KEY: 'k' }).generateWithTools({
        systemInstruction: 'sys',
        prompt: 'q',
        declarations,
        executeTool,
      }),
    ).resolves.toEqual({ text: null, toolsUsed: [] });

    expect(generateContent).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('returns direct text when the model does not call any tool', async () => {
    generateContent.mockResolvedValueOnce({ text: '  C major in bars 1-4.  ' });
    const executeTool = jest.fn();

    const result = await buildClient(env).generateWithTools({
      systemInstruction: 'sys',
      prompt: 'What key is this?',
      declarations,
      executeTool,
    });

    expect(result).toEqual({
      text: 'C major in bars 1-4.',
      toolsUsed: [],
    });
    expect(executeTool).not.toHaveBeenCalled();
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'What key is this?' }] }],
      }),
    );
  });

  it('executes function calls across rounds, appends parts, and dedupes toolsUsed in order', async () => {
    generateContent
      .mockResolvedValueOnce({
        functionCalls: [
          { id: 'c1', name: 'list_branches', args: {} },
          {
            id: 'c2',
            name: 'get_theory_range',
            args: { fromBar: 1, toBar: 8 },
          },
        ],
      })
      .mockResolvedValueOnce({
        functionCalls: [
          {
            id: 'c3',
            name: 'list_branches',
            args: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        text: '  Branches: main, chorus-v2. Key: C major.  ',
      });

    const executeTool = jest.fn((name: string) =>
      Promise.resolve(
        name === 'list_branches'
          ? { branches: ['main', 'chorus-v2'] }
          : { key: { tonic: 'C', mode: 'major' } },
      ),
    );

    const result = await buildClient(env).generateWithTools({
      systemInstruction: 'Read-only Q&A',
      prompt: 'Compare branches and key',
      declarations,
      executeTool,
    });

    expect(result).toEqual({
      text: 'Branches: main, chorus-v2. Key: C major.',
      toolsUsed: ['list_branches', 'get_theory_range'],
    });
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(generateContent).toHaveBeenCalledTimes(3);

    const secondCallContents = generateContent.mock.calls[1][0].contents;
    expect(secondCallContents).toHaveLength(3);
    expect(secondCallContents[1]).toEqual({
      role: 'model',
      parts: [
        { functionCall: { id: 'c1', name: 'list_branches', args: {} } },
        {
          functionCall: {
            id: 'c2',
            name: 'get_theory_range',
            args: { fromBar: 1, toBar: 8 },
          },
        },
      ],
    });
    expect(secondCallContents[2]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'c1',
            name: 'list_branches',
            response: { branches: ['main', 'chorus-v2'] },
          },
        },
        {
          functionResponse: {
            id: 'c2',
            name: 'get_theory_range',
            response: { key: { tonic: 'C', mode: 'major' } },
          },
        },
      ],
    });
  });

  it('wraps thrown tool errors into { error: "tool_failed" } and continues', async () => {
    generateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'list_branches', args: {} }],
      })
      .mockResolvedValueOnce({
        text: 'Branch lookup failed temporarily.',
      });

    const executeTool = jest.fn().mockRejectedValue(new Error('db down'));

    const result = await buildClient(env).generateWithTools({
      systemInstruction: 'sys',
      prompt: 'List branches',
      declarations,
      executeTool,
    });

    expect(result).toEqual({
      text: 'Branch lookup failed temporarily.',
      toolsUsed: ['list_branches'],
    });
    expect(generateContent.mock.calls[1][0].contents[2]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'list_branches',
            response: { error: 'tool_failed' },
          },
        },
      ],
    });
  });

  it('stops executing tools after maxRounds and handles SDK errors cleanly', async () => {
    generateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'list_branches', args: {} }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'get_theory_range', args: {} }],
      })
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'list_branches', args: {} }],
      });

    const executeTool = jest.fn().mockResolvedValue({ ok: true });

    const capped = await buildClient(env).generateWithTools({
      systemInstruction: 'sys',
      prompt: 'q',
      declarations,
      executeTool,
      maxRounds: 2,
    });

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(capped).toEqual({
      text: null,
      toolsUsed: ['list_branches', 'get_theory_range'],
    });

    generateContent.mockReset();
    generateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: 'list_branches', args: {} }],
      })
      .mockRejectedValueOnce(new Error('rate limit'));

    const errored = await buildClient(env).generateWithTools({
      systemInstruction: 'sys',
      prompt: 'q',
      declarations,
      executeTool,
    });
    expect(errored).toEqual({ text: null, toolsUsed: ['list_branches'] });
  });

  it('returns null without throwing when the call hangs past timeoutMs', async () => {
    jest.useFakeTimers();
    generateContent.mockReturnValue(new Promise(() => undefined));

    const pending = buildClient(env).generateWithTools({
      systemInstruction: 'sys',
      prompt: 'q',
      declarations,
      executeTool: jest.fn(),
      timeoutMs: 12_000,
    });

    await jest.advanceTimersByTimeAsync(12_000);
    await expect(pending).resolves.toEqual({ text: null, toolsUsed: [] });
  });
});
