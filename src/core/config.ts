// src/core/config.ts
// Application configuration loader.
// Reads config.yaml from project root, falls back to sensible defaults.

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AppConfig, OllamaConfig, BudgetConfig, RetryConfig, SystemPromptsConfig } from './types';

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
    systemPrompts: {
        planAgent: `You are a project planning assistant. Given a user request, break it down into a sequential list of tasks.

AVAILABLE SKILLS:
{{skillList}}

RULES:
1. Each task MUST use one of the available skills (set skill_id to the skill name).
2. Avoid setting skill_id to null. Always try to match the closest skill first. Only use null as a last resort.
3. Tasks execute sequentially. Use dependencies to indicate ordering.
4. Keep task descriptions specific and actionable.
5. Respond with RAW JSON only. No markdown. No explanation.
6. Do NOT over-decompose. If a request can be handled by a single skill, create ONE task.
7. ALWAYS add a FINAL task with skill_id set to null, titled "Report final results". This task MUST depend on ALL previous tasks and its input should instruct to summarize all previous task outputs into a clear, concise, user-friendly report.

OUTPUT FORMAT:
{
  "tasks": [
    {"id": "task_1", "title": "...", "skill_id": "...", "input": "...", "dependencies": []},
    {"id": "task_2", "title": "...", "skill_id": "...", "input": "...", "dependencies": ["task_1"]},
    {"id": "task_final", "title": "Report final results", "skill_id": null, "input": "Summarize all previous task outputs into a clear report for the user.", "dependencies": ["task_1", "task_2"]}
  ]
}`,
        taskAgent: `You are a coding assistant. Analyze the provided context and answer the user task. Respond with a clear, detailed summary. Use RAW JSON with a single "summary" field.`
    }
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
        systemPrompts: { ...DEFAULT_CONFIG.systemPrompts, ...(parsed.systemPrompts ?? {}) },
    };
}

export { DEFAULT_CONFIG };
