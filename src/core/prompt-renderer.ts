// src/core/prompt-renderer.ts
// Template interpolation engine for rendering prompt templates.
// Substitutes {{variable}} placeholders with values from a context object.

import { ChatMessage } from './types';
import { countTokens } from '../utils/token-counter';

export interface Example {
    input: string;
    output: string;
}

export interface PromptTemplateConfig {
    system: string;
    user: string;
    fewShot?: Example[];
}

/**
 * Interpolate {{key}} and {{key.subkey}} placeholders in a template string.
 * Supports a simple pipe for truncation: {{var | truncate(N)}}
 */
export function interpolate(template: string, vars: Record<string, any>): string {
    return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
        const trimmed = expr.trim();

        // Handle truncate pipe: {{var | truncate(N)}}
        const pipeMatch = trimmed.match(/^(.+?)\s*\|\s*truncate\((\d+)\)$/);
        if (pipeMatch) {
            const varName = pipeMatch[1].trim();
            const maxLen = parseInt(pipeMatch[2], 10);
            const value = resolveVar(varName, vars);
            const str = String(value ?? '');
            return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
        }

        const value = resolveVar(trimmed, vars);
        return value !== undefined ? String(value) : `{{${trimmed}}}`;
    });
}

/**
 * Resolve dot-separated variable path: "state.summary" → vars.state.summary
 */
function resolveVar(path: string, vars: Record<string, any>): any {
    const parts = path.split('.');
    let current: any = vars;

    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[part];
    }

    return current;
}

/**
 * Render a full prompt from a template config and variables.
 * Returns an array of ChatMessages ready to send to LLMProvider.
 */
export function renderPrompt(
    template: PromptTemplateConfig,
    vars: Record<string, any>,
): ChatMessage[] {
    const messages: ChatMessage[] = [
        { role: 'system', content: interpolate(template.system, vars) },
    ];

    if (template.fewShot) {
        for (const ex of template.fewShot) {
            messages.push({ role: 'user', content: ex.input });
            messages.push({ role: 'assistant', content: ex.output });
        }
    }

    messages.push({ role: 'user', content: interpolate(template.user, vars) });

    return messages;
}

/**
 * Estimate total token count for a rendered prompt.
 */
export function estimatePromptTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const m of messages) {
        // +4 per message overhead (role, delimiters)
        total += countTokens(m.content) + 4;
    }
    return total;
}
