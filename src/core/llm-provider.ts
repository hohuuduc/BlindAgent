// src/core/llm-provider.ts
// LLMProvider abstraction with OllamaProvider implementation.
// Decouples the engine from any specific LLM backend.

import { ZodSchema } from 'zod';
import { ChatMessage, CompletionOptions, OllamaConfig } from './types';
import { sanitizeLLMJson } from './json-sanitizer';

// ─── Abstract interface ─────────────────────────────────────

export interface LLMProvider {
    /** Send messages and receive a text response */
    complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>;

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

    constructor(config: OllamaConfig) {
        this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
        this.model = config.model;
        this.embedModel = config.embedModel ?? 'nomic-embed-text';
    }

    async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                messages,
                stream: false,
                options: {
                    temperature: options?.temperature ?? 0.7,
                    num_predict: options?.maxTokens ?? 2048,
                    stop: options?.stop,
                },
                ...(options?.jsonMode ? { format: 'json' } : {}),
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as any;
        return data.message?.content ?? '';
    }

    async structuredOutput<T>(messages: ChatMessage[], schema: ZodSchema<T>, options?: CompletionOptions): Promise<T> {
        const mergedOptions = { ...options, jsonMode: true, temperature: 0.1 };
        const raw = await this.complete(messages, mergedOptions);
        const sanitized = sanitizeLLMJson(raw);

        try {
            const parsed = JSON.parse(sanitized);
            return schema.parse(parsed);
        } catch (_firstErr) {
            // Retry once with explicit correction prompt
            const retryRaw = await this.complete([
                ...messages,
                { role: 'assistant', content: raw },
                { role: 'user', content: 'JSON format error. Return RAW JSON only, NO markdown.' },
            ], { ...mergedOptions, temperature: 0.0 });

            const retrySanitized = sanitizeLLMJson(retryRaw);
            return schema.parse(JSON.parse(retrySanitized));
        }
    }

    async embed(text: string): Promise<number[]> {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.embedModel,
                prompt: text,
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama embedding error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as any;
        return data.embedding;
    }

    async healthCheck(): Promise<boolean> {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`);
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
