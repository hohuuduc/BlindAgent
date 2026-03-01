// src/core/engine.ts
// State Machine Engine — executes a SkillGraph node by node.
// Each node transition is checkpointed to disk for crash recovery.
// Nodes are executed based on their tool type: llm, tool, human_input.

import { SkillGraph, SkillNode, ChatMessage, Checkpoint } from './types';
import { LLMProvider } from './llm-provider';
import { renderPrompt, interpolate, PromptTemplateConfig } from './prompt-renderer';
import { WorkingMemory } from '../memory/working';
import { CheckpointManager } from '../memory/checkpoint';
import { ToolRegistry, ToolResult } from '../tools/registry';
import { logger } from '../utils/logger';
import * as readline from 'readline';

// ─── Node Summary (deterministic, no LLM call) ─────────────

function buildNodeSummary(nodeId: string, nodeType: string, output: any): string {
    if (!output) return `[${nodeId}] Completed.`;

    switch (nodeType) {
        case 'read_file':
            return `[${nodeId}] Read file ${output.path ?? '?'} (${output.lineCount ?? '?'} lines).`;
        case 'write_file':
            return `[${nodeId}] Wrote file ${output.path ?? '?'} (${output.lineCount ?? '?'} lines).`;
        case 'syntax_check':
            return `[${nodeId}] Syntax ${output.valid ? 'OK' : 'ERROR: ' + (output.errors?.[0]?.message ?? 'unknown')}.`;
        case 'run_command':
            return `[${nodeId}] Command exit=${output.exitCode ?? '?'}.`;
        case 'llm':
            const keys = output && typeof output === 'object'
                ? Object.keys(output).slice(0, 5).join(', ')
                : '?';
            return `[${nodeId}] LLM output: {${keys}}.`;
        case 'human_input':
            return `[${nodeId}] User action: ${output.action ?? 'unknown'}.`;
        default:
            return `[${nodeId}] Completed (${nodeType}).`;
    }
}

function trimSummary(summary: string, maxLines: number = 20): string {
    const lines = summary.split('\n').filter(l => l.trim());
    if (lines.length <= maxLines) return lines.join('\n');
    return lines.slice(-maxLines).join('\n');
}

// ─── Engine ─────────────────────────────────────────────────

export interface EngineContext {
    llm: LLMProvider;
    tools: ToolRegistry;
    checkpoint: CheckpointManager;
    taskId: string;
    skillId: string;
}

export interface EngineResult {
    success: boolean;
    finalOutput: any;
    summary: string;
    error?: string;
}

/**
 * Execute a SkillGraph from start to finish.
 * Supports crash recovery: if a checkpoint exists for this task, resumes from there.
 */
export async function executeSkillGraph(
    skill: SkillGraph,
    input: string,
    ctx: EngineContext,
): Promise<EngineResult> {
    // Determine starting point — check for existing checkpoint
    let memory: WorkingMemory;
    let currentNodeId: string;
    let retryCount = 0;

    const existingCheckpoint = ctx.checkpoint.load(ctx.taskId);

    if (existingCheckpoint && existingCheckpoint.skillId === ctx.skillId) {
        // Resume from checkpoint
        logger.info('Engine', `Resuming task ${ctx.taskId} from node "${existingCheckpoint.currentNodeId}"`);
        memory = WorkingMemory.fromJSON(existingCheckpoint.stateSlots);
        currentNodeId = existingCheckpoint.currentNodeId;
        retryCount = existingCheckpoint.retryCount;
    } else {
        // Fresh start
        memory = new WorkingMemory();
        memory.set('taskInput', input, 'persistent');
        memory.set('summary', '', 'persistent');
        memory.set('targetFiles', [], 'persistent');

        // Get the first node
        const firstKey = skill.nodes.keys().next().value;
        if (!firstKey) {
            return { success: false, finalOutput: null, summary: '', error: 'Skill has no nodes' };
        }
        currentNodeId = firstKey;
    }

    // Main execution loop
    let lastOutput: any = null;

    while (true) {
        const node = skill.nodes.get(currentNodeId);
        if (!node) {
            return {
                success: false,
                finalOutput: lastOutput,
                summary: memory.get('summary') ?? '',
                error: `Node not found: ${currentNodeId}`,
            };
        }

        // Save checkpoint BEFORE executing node
        const checkpoint: Checkpoint = {
            taskId: ctx.taskId,
            skillId: ctx.skillId,
            currentNodeId,
            stateSlots: memory.toJSON(),
            summary: memory.get('summary') ?? '',
            retryCount,
            timestamp: Date.now(),
        };
        ctx.checkpoint.save(checkpoint);

        logger.info('Engine', `Executing node "${currentNodeId}" (tool: ${node.tool})`);

        try {
            // Execute the node based on its tool type
            const result = await executeNode(node, skill, memory, ctx);

            // Store output in carry-over slot
            memory.set('lastOutput', result, 'carry-over', 2);
            lastOutput = result;

            // Append deterministic node summary
            const summary = memory.get('summary') ?? '';
            const nodeSummary = buildNodeSummary(currentNodeId, node.tool, result);
            memory.set('summary', trimSummary(summary + '\n' + nodeSummary), 'persistent');

            // Advance working memory lifecycle
            memory.advanceNode();

            // Reset retry count on success
            retryCount = 0;

            // Determine next node via edge conditions
            const nextNodeId = evaluateEdges(node, result, memory);

            if (!nextNodeId) {
                // No more edges — skill complete
                ctx.checkpoint.delete(ctx.taskId);
                return {
                    success: true,
                    finalOutput: lastOutput,
                    summary: memory.get('summary') ?? '',
                };
            }

            currentNodeId = nextNodeId;

        } catch (err: any) {
            retryCount++;
            const maxRetries = node.maxRetries ?? ctx.tools.has(node.tool) ? 3 : 2;

            logger.error('Engine', `Node "${currentNodeId}" failed (attempt ${retryCount}/${maxRetries}): ${err.message}`);

            if (retryCount >= maxRetries) {
                ctx.checkpoint.delete(ctx.taskId);
                return {
                    success: false,
                    finalOutput: lastOutput,
                    summary: memory.get('summary') ?? '',
                    error: `Node "${currentNodeId}" failed after ${retryCount} retries: ${err.message}`,
                };
            }

            // Retry — loop back to same node
            logger.info('Engine', `Retrying node "${currentNodeId}" (attempt ${retryCount + 1})`);
        }
    }
}

// ─── Node Execution ─────────────────────────────────────────

async function executeNode(
    node: SkillNode,
    skill: SkillGraph,
    memory: WorkingMemory,
    ctx: EngineContext,
): Promise<any> {
    // Build variable context from memory slots
    const vars = buildVarsFromMemory(memory);

    switch (node.tool) {
        case 'llm':
            return await executeLLMNode(node, skill, vars, ctx);

        case 'human_input':
            return await executeHumanInputNode(node, memory);

        default:
            // Tool execution
            return await executeToolNode(node, vars, ctx);
    }
}

async function executeLLMNode(
    node: SkillNode,
    skill: SkillGraph,
    vars: Record<string, any>,
    ctx: EngineContext,
): Promise<any> {
    const templateName = node.promptTemplate;
    if (!templateName) {
        throw new Error(`LLM node "${node.id}" has no prompt_template`);
    }

    const templateBody = skill.promptTemplates.get(templateName);
    if (!templateBody) {
        throw new Error(`Prompt template not found: "${templateName}"`);
    }

    const config: PromptTemplateConfig = {
        system: 'You are a coding assistant. Respond with RAW JSON only. No markdown, no explanation.',
        user: templateBody,
    };

    const messages = renderPrompt(config, vars);
    const raw = await ctx.llm.complete(messages, { jsonMode: true, temperature: 0.1 });

    // Try to parse as JSON
    try {
        const { sanitizeLLMJson } = require('./json-sanitizer');
        const sanitized = sanitizeLLMJson(raw);
        return JSON.parse(sanitized);
    } catch {
        // Return raw string if not parseable
        return { raw };
    }
}

async function executeHumanInputNode(
    node: SkillNode,
    memory: WorkingMemory,
): Promise<{ action: string; content?: string }> {
    const promptText = node.promptUser ?? 'Please provide input:';
    const lastOutput = memory.get('lastOutput');

    // Display context
    if (node.display === 'error' && lastOutput?.error) {
        console.log('\n--- Error ---');
        console.log(lastOutput.error);
        console.log('---\n');
    } else if (node.display === 'code' && lastOutput?.content) {
        console.log('\n--- Code ---');
        console.log(lastOutput.content);
        console.log('---\n');
    }

    console.log(`\n⚠️  ${promptText}`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise<{ action: string; content?: string }>((resolve) => {
        rl.question('> ', (answer) => {
            rl.close();
            const trimmed = answer.trim();
            if (trimmed.toLowerCase() === 'skip') {
                resolve({ action: 'skip' });
            } else {
                resolve({ action: 'fix', content: trimmed });
            }
        });
    });
}

async function executeToolNode(
    node: SkillNode,
    vars: Record<string, any>,
    ctx: EngineContext,
): Promise<any> {
    const result = await ctx.tools.execute(node.tool, vars);
    if (!result.success) {
        throw new Error(`Tool "${node.tool}" failed: ${result.error}`);
    }
    return result.output;
}

// ─── Edge Evaluation ────────────────────────────────────────

function evaluateEdges(
    node: SkillNode,
    result: any,
    memory: WorkingMemory,
): string | null {
    if (node.edges.length === 0) return null;

    for (const edge of node.edges) {
        if (edge.condition === 'always') {
            return edge.target;
        }

        // Evaluate simple JS conditions
        try {
            const fn = new Function('result', 'state', `return (${edge.condition})`);
            const vars = buildVarsFromMemory(memory);
            if (fn(result, vars)) {
                return edge.target;
            }
        } catch {
            // If condition evaluation fails, skip this edge
            continue;
        }
    }

    // If no condition matched, take the first edge as fallback
    return node.edges[0]?.target ?? null;
}

// ─── Helpers ────────────────────────────────────────────────

function buildVarsFromMemory(memory: WorkingMemory): Record<string, any> {
    const vars: Record<string, any> = {};
    for (const key of memory.keys()) {
        vars[key] = memory.get(key);
    }
    // Also expose as state.X for compatibility with templates
    vars.state = { ...vars };
    return vars;
}
