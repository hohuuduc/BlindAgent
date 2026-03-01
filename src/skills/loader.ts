// src/skills/loader.ts
// Parses .md skill files into SkillGraph objects.
// YAML frontmatter defines nodes/edges, markdown body defines prompt templates.

import * as fs from 'fs';
import matter from 'gray-matter';
import { SkillGraph, SkillNode, SkillEdge } from '../core/types';

/**
 * Parse a skill markdown file into a SkillGraph.
 * The file must have:
 *   - YAML frontmatter with name, description, version, nodes[]
 *   - Markdown body with ## Prompt Templates and ### <template_name> sections
 */
export function loadSkillFromFile(filePath: string): SkillGraph {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return parseSkillMarkdown(raw);
}

/**
 * Parse skill markdown content string into a SkillGraph.
 */
export function parseSkillMarkdown(content: string): SkillGraph {
    const { data, content: body } = matter(content);

    if (!data.name || !data.nodes) {
        throw new Error('Skill file missing required fields: name, nodes');
    }

    // Parse nodes from YAML
    const nodes = new Map<string, SkillNode>();
    for (const raw of data.nodes as any[]) {
        const node: SkillNode = {
            id: raw.id,
            tool: raw.tool,
            promptTemplate: raw.prompt_template,
            outputSchema: raw.output_schema,
            contextBudget: raw.context_budget,
            maxRetries: raw.max_retries,
            preserveSlots: raw.preserve_slots,
            display: raw.display,
            promptUser: raw.prompt_user,
            edges: (raw.edges ?? []).map((e: any) => ({
                target: typeof e === 'string' ? e : (e.target ?? ''),
                condition: typeof e === 'string' ? 'always' : (e.condition ?? 'always'),
            })),
        };
        nodes.set(node.id, node);
    }

    // Parse prompt templates from markdown body
    const promptTemplates = parsePromptTemplates(body);

    return {
        name: data.name,
        description: data.description ?? '',
        version: data.version ?? '1.0.0',
        nodes,
        promptTemplates,
    };
}

/**
 * Extract prompt templates from markdown body.
 * Format: ### <template_name> followed by content until next ### or EOF.
 */
function parsePromptTemplates(body: string): Map<string, string> {
    const templates = new Map<string, string>();
    const lines = body.split('\n');

    let currentName: string | null = null;
    let currentLines: string[] = [];

    for (const line of lines) {
        const heading = line.match(/^###\s+(.+)$/);
        if (heading) {
            // Save previous template
            if (currentName !== null) {
                templates.set(currentName, currentLines.join('\n').trim());
            }
            currentName = heading[1].trim();
            currentLines = [];
        } else if (currentName !== null) {
            currentLines.push(line);
        }
    }

    // Save last template
    if (currentName !== null) {
        templates.set(currentName, currentLines.join('\n').trim());
    }

    return templates;
}
