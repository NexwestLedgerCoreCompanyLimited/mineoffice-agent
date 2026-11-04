import { LLMProvider, AppSettings, ImageAttachment } from '@shared/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: ImageAttachment[];
}

/** OpenAI, OpenRouter and most compatible services take images as parts of the message. */
function openAiMessage(message: ChatMessage) {
  if (!message.images?.length) return { role: message.role, content: message.content };
  return {
    role: message.role,
    content: [
      { type: 'text', text: message.content },
      ...message.images.map(image => ({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } }))
    ]
  };
}

export interface CompletionOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export class MultiLLMProvider {
  private settings: AppSettings;

  constructor(settings: AppSettings) {
    this.settings = settings;
  }

  public updateSettings(settings: AppSettings) {
    this.settings = settings;
  }

  /** Ollama needs no key, so it counts as configured only when chosen as the default. */
  private isConfigured(provider: LLMProvider): boolean {
    if (provider === 'ollama') return this.settings.activeDefaultProvider === 'ollama';
    if (provider === 'openai' && this.settings.providers.openai.baseUrl) return true;
    return !!this.settings.providers[provider].apiKey;
  }

  public async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<string> {
    // An agent's preferred provider may have no key yet. Its model name only fits that
    // provider, so falling back to the default also falls back to the default's model.
    const usable = options.provider && this.isConfigured(options.provider);
    if (!usable) {
      options = { ...options, provider: this.settings.activeDefaultProvider, model: undefined };
    }
    const provider = options.provider!;

    try {
      switch (provider) {
        case 'openrouter':
          return await this.completeOpenRouter(messages, options);
        case 'gemini':
          return await this.completeGemini(messages, options);
        case 'claude':
          return await this.completeClaude(messages, options);
        case 'openai':
          return await this.completeOpenAI(messages, options);
        case 'ollama':
          return await this.completeOllama(messages, options);
        default:
          throw new Error(`Unsupported LLM provider: ${provider}`);
      }
    } catch (err: any) {
      // Many free models read text only, and their error rarely says so
      if (messages.some(message => message.images?.length)) {
        throw new Error(`${err.message} This model may not be able to read images. Choose one that can in AI Settings.`);
      }
      throw err;
    }
  }

  /**
   * OpenRouter Provider
   * Supports any OpenRouter model, including 100% free models like:
   * - meta-llama/llama-3.3-70b-instruct:free
   * - google/gemini-2.0-flash-exp:free
   * - deepseek/deepseek-r1:free
   * - mistralai/mistral-7b-instruct:free
   */
  private async completeOpenRouter(
    messages: ChatMessage[],
    options: CompletionOptions
  ): Promise<string> {
    const apiKey = this.settings.providers.openrouter.apiKey;
    const model = options.model || this.settings.providers.openrouter.model || 'meta-llama/llama-3.3-70b-instruct:free';

    if (!apiKey) {
      throw new Error('OpenRouter API key is required. Please set it in Settings.');
    }

    const payloadMessages = [...messages];
    if (options.systemPrompt && !payloadMessages.some(m => m.role === 'system')) {
      payloadMessages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/mineoffice-agent',
        'X-Title': 'MineOffice Agent Studio'
      },
      body: JSON.stringify({
        model,
        messages: payloadMessages.map(openAiMessage),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Google Gemini Provider (Native REST API)
   */
  private async completeGemini(
    messages: ChatMessage[],
    options: CompletionOptions
  ): Promise<string> {
    const apiKey = this.settings.providers.gemini.apiKey;
    const model = options.model || this.settings.providers.gemini.model || 'gemini-2.5-flash';

    if (!apiKey) {
      throw new Error('Gemini API key is required. Please set it in Settings.');
    }

    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [
          { text: m.content },
          ...(m.images || []).map(image => ({ inline_data: { mime_type: image.mimeType, data: image.base64 } }))
        ]
      }));

    const systemMessage = options.systemPrompt || messages.find(m => m.role === 'system')?.content;

    const body: any = { contents };
    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: systemMessage }]
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Anthropic Claude Provider
   */
  private async completeClaude(
    messages: ChatMessage[],
    options: CompletionOptions
  ): Promise<string> {
    const apiKey = this.settings.providers.claude.apiKey;
    const model = options.model || this.settings.providers.claude.model || 'claude-3-7-sonnet-20250219';

    if (!apiKey) {
      throw new Error('Anthropic Claude API key is required. Please set it in Settings.');
    }

    const systemPrompt = options.systemPrompt || messages.find(m => m.role === 'system')?.content;
    const nonSystemMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.images?.length
          ? [
              ...m.images.map(image => ({
                type: 'image',
                source: { type: 'base64', media_type: image.mimeType, data: image.base64 }
              })),
              { type: 'text', text: m.content }
            ]
          : m.content
      }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        messages: nonSystemMessages,
        system: systemPrompt,
        max_tokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  /**
   * OpenAI / OpenAI-compatible Provider
   */
  private async completeOpenAI(
    messages: ChatMessage[],
    options: CompletionOptions
  ): Promise<string> {
    const apiKey = this.settings.providers.openai.apiKey;
    const model = options.model || this.settings.providers.openai.model || 'gpt-4o';

    // Local OpenAI-compatible servers, such as LM Studio, need no key
    const baseUrl = (this.settings.providers.openai.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    if (!apiKey && !this.settings.providers.openai.baseUrl) {
      throw new Error('OpenAI API key is required. Please set it in Settings.');
    }

    const payloadMessages = [...messages];
    if (options.systemPrompt && !payloadMessages.some(m => m.role === 'system')) {
      payloadMessages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: payloadMessages.map(openAiMessage),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Local Ollama Provider (100% Free & Local)
   */
  private async completeOllama(
    messages: ChatMessage[],
    options: CompletionOptions
  ): Promise<string> {
    const baseUrl = this.settings.providers.ollama.baseUrl || 'http://localhost:11434';
    const model = options.model || this.settings.providers.ollama.model || 'llama3';

    const payloadMessages = [...messages];
    if (options.systemPrompt && !payloadMessages.some(m => m.role === 'system')) {
      payloadMessages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: payloadMessages.map(({ images, ...message }) =>
          images?.length ? { ...message, images: images.map(image => image.base64) } : message
        ),
        stream: false
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error (${res.status}): ${err}. Ensure Ollama is running at ${baseUrl}`);
    }

    const data = await res.json();
    return data.message?.content || '';
  }
}
