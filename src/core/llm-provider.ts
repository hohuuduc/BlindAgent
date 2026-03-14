// src/core/llm-provider.ts
// LLMProvider abstraction with OllamaProvider implementation.
// Decouples the engine from any specific LLM backend.
// Enhanced: captures thinking content and logs all LLM interactions to file.

import { ZodSchema } from 'zod';
import { ChatMessage, CompletionOptions, OllamaConfig, LLMResponse } from './types';
import { sanitizeLLMJson } from './json-sanitizer';
import { logger } from '../utils/logger';

// ─── Abstract interface ─────────────────────────────────────

export interface LLMProvider {
    /** Send messages and receive a structured response (content + thinking) */
    complete(messages: ChatMessage[], options?: CompletionOptions): Promise<LLMResponse>;

    /** Send messages and receive structured, validated JSON */
    structuredOutput<T>(messages: ChatMessage[], schema: ZodSchema<T>, options?: CompletionOptions): Promise<T>;

    /** Generate an embedding vector for text (used by SemanticMemory) */
    embed(text: string): Promise<number[]>;

    /** Check if the provider is reachable */
    healthCheck(): Promise<boolean>;
}

// ─── Ollama implementation ──────────────────────────────────

export class OllamaProvider implements LLMProvider {
    private baseUrl: string;
    private model: string;
    private embedModel: string;
    private timeoutMs?: number;

    constructor(config: OllamaConfig) {
        this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
        this.model = config.model;
        this.embedModel = config.embedModel ?? 'nomic-embed-text';
        this.timeoutMs = config.timeoutMs;
    }

    async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<LLMResponse> {
        // Log request messages to file
        logger.block('LLM', 'REQUEST MESSAGES', messages.map(m => `[${m.role}]\n${m.content}`).join('\n---\n'));

        const body: any = {
            model: this.model,
            messages,
            stream: false,
            options: {
                temperature: options?.temperature ?? 0.7,
                num_predict: options?.maxTokens ?? 2048,
                stop: options?.stop,
            },
            ...(options?.jsonMode ? { format: 'json' } : {}),
        };

        // Enable thinking if requested
        if (options?.think !== undefined) {
            body.think = options.think;
        }

        const controller = new AbortController();
        const timeoutId = this.timeoutMs ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal as RequestInit["signal"],
            });

            if (!response.ok) {
                const errorText = `Ollama API error: ${response.status} ${response.statusText}`;
                logger.error('LLM', errorText);
                throw new Error(errorText);
            }

            const data = await response.json() as any;
            const content = data.message?.content ?? '';
            const thinking = data.message?.thinking ?? null;

            // Log thinking content (if present)
            if (thinking) {
                logger.info('LLM', `Thinking trace received (${thinking.length} chars)`);
            }

            // Log model response content
            logger.info('LLM', `Response received (${content.length} chars)`);

            // Log raw API response metadata
            const meta = {
                model: data.model,
                total_duration: data.total_duration,
                eval_count: data.eval_count,
                eval_duration: data.eval_duration,
                prompt_eval_count: data.prompt_eval_count,
            };
            logger.block('LLM', 'RESPONSE METADATA', JSON.stringify(meta, null, 2));

            return { content, thinking, raw: data };
        } catch (err: any) {
            if (err.name === 'AbortError') {
                const errorText = `Ollama API timeout after ${this.timeoutMs}ms`;
                logger.error('LLM', errorText);
                throw new Error(errorText);
            }
            throw err;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    async structuredOutput<T>(messages: ChatMessage[], schema: ZodSchema<T>, options?: CompletionOptions): Promise<T> {
        const mergedOptions = { ...options, jsonMode: true, temperature: 0.1 };
        const llmResponse = await this.complete(messages, mergedOptions);
        const sanitized = sanitizeLLMJson(llmResponse.content);

        try {
            const parsed = JSON.parse(sanitized);
            return schema.parse(parsed);
        } catch (_firstErr) {
            logger.warn('LLM', 'First parse failed, retrying with correction prompt');
            logger.block('LLM', 'PARSE ERROR — RAW CONTENT', llmResponse.content);

            // Retry once with explicit correction prompt
            const retryResponse = await this.complete([
                ...messages,
                { role: 'assistant', content: llmResponse.content },
                { role: 'user', content: 'JSON format error. Return RAW JSON only, NO markdown.' },
            ], { ...mergedOptions, temperature: 0.0 });

            const retrySanitized = sanitizeLLMJson(retryResponse.content);
            const retryParsed = JSON.parse(retrySanitized);
            logger.block('LLM', 'STRUCTURED OUTPUT (retry parsed)', JSON.stringify(retryParsed, null, 2));
            return schema.parse(retryParsed);
        }
    }

    async embed(text: string): Promise<number[]> {
        const controller = new AbortController();
        const timeoutId = this.timeoutMs ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;

        try {
            const response = await fetch(`${this.baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.embedModel,
                    prompt: text,
                }),
                signal: controller.signal as RequestInit["signal"],
            });

            if (!response.ok) {
                throw new Error(`Ollama embedding error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any;
            return data.embedding;
        } catch (err: any) {
            if (err.name === 'AbortError') {
                const errorText = `Ollama embedding timeout after ${this.timeoutMs}ms`;
                logger.error('LLM', errorText);
                throw new Error(errorText);
            }
            throw err;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(`${this.baseUrl}/api/tags`, {
                signal: controller.signal as RequestInit["signal"],
            });
            clearTimeout(timeoutId);
            return res.ok;
        } catch {
            return false;
        }
    }
}

// ─── Factory ────────────────────────────────────────────────

export function createLLMProvider(config: { provider: string; ollama: OllamaConfig }): LLMProvider {
    switch (config.provider) {
        case 'ollama':
            return new OllamaProvider(config.ollama);
        default:
            throw new Error(`Unknown LLM provider: ${config.provider}`);
    }
}
