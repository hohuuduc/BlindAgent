// src/core/config.ts
// Application configuration loader.
// Reads config.yaml from project root, falls back to sensible defaults.

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AppConfig, OllamaConfig, BudgetConfig, RetryConfig } from './types';

const DEFAULT_CONFIG: AppConfig = {
    provider: 'ollama',
    ollama: {
        baseUrl: 'http://localhost:11434',
        model: 'qwen2.5-coder:14b',
        embedModel: 'nomic-embed-text',
    },
    budgets: {
        systemPrompt: 300,
        fewShot: 500,
        taskContext: 1500,
        semanticQuery: 1000,
        codeChunk: 2000,
    },
    retries: {
        jsonFormat: 2,
        nodeExecution: 3,
    },
};

/**
 * Load configuration from a YAML file, merging with defaults.
 * If the file does not exist, returns defaults only.
 */
export function loadConfig(configPath?: string): AppConfig {
    const resolved = configPath ?? path.join(process.cwd(), 'config.yaml');

    if (!fs.existsSync(resolved)) {
        return { ...DEFAULT_CONFIG };
    }

    const raw = fs.readFileSync(resolved, 'utf-8');
    const parsed = yaml.load(raw) as Partial<AppConfig> | null;

    if (!parsed || typeof parsed !== 'object') {
        return { ...DEFAULT_CONFIG };
    }

    return {
        provider: parsed.provider ?? DEFAULT_CONFIG.provider,
        ollama: { ...DEFAULT_CONFIG.ollama, ...(parsed.ollama ?? {}) },
        budgets: { ...DEFAULT_CONFIG.budgets, ...(parsed.budgets ?? {}) },
        retries: { ...DEFAULT_CONFIG.retries, ...(parsed.retries ?? {}) },
    };
}

export { DEFAULT_CONFIG };
