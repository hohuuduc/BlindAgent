// src/agents/task-agent.ts
// Task Agent — receives a single task, loads its skill, and runs the engine.
// Supports null-skill tasks via direct LLM summarization.

import { Task, SkillGraph, ChatMessage, AppConfig } from '../core/types';
import { executeSkillGraph, EngineContext, EngineResult } from '../core/engine';
import { SkillRegistry } from '../skills/registry';
import { LLMProvider } from '../core/llm-provider';
import { ToolRegistry } from '../tools/registry';
import { CheckpointManager } from '../memory/checkpoint';
import { TaskOutputManager } from '../memory/task-output';
import { SemanticMemory } from '../memory/semantic';
import { logger } from '../utils/logger';

export interface TaskAgentDeps {
    llm: LLMProvider;
    skills: SkillRegistry;
    tools: ToolRegistry;
    checkpoint: CheckpointManager;
    taskOutput: TaskOutputManager;
    semanticMemory?: SemanticMemory;
    config?: AppConfig;
}

/**
 * Execute a single task using its assigned skill.
 * If no skill is assigned, runs a direct LLM call with previous task context.
 * Updates the task status in-place.
 */
export async function runTask(task: Task, deps: TaskAgentDeps): Promise<void> {
    logger.info('TaskAgent', `Starting task "${task.title}" (id: ${task.id})`);

    // No skill assigned — run direct LLM summarization
    if (!task.skillId) {
        await runDirectLLMTask(task, deps);
        return;
    }

    const skill = deps.skills.get(task.skillId);
    if (!skill) {
        task.status = 'blocked';
        logger.warn('TaskAgent', `Skill "${task.skillId}" not found — task blocked`);
        return;
    }

    task.status = 'running';

    // Enrich task input with semantic context from past tasks
    let enrichedInput = task.input;
    if (deps.semanticMemory) {
        const relevant = await deps.semanticMemory.safeSearch(task.input, 3);
        if (relevant.length > 0) {
            const contextLines = relevant.map(
                (r, i) => `  ${i + 1}. [score=${r.score.toFixed(2)}] ${r.text.slice(0, 200)}`
            ).join('\n');
            enrichedInput += `\n\n[SEMANTIC CONTEXT from past tasks]:\n${contextLines}`;
            logger.info('TaskAgent', `Injected ${relevant.length} semantic context items into task "${task.id}"`);
        }
    }

    // Create engine context
    const engineCtx: EngineContext = {
        llm: deps.llm,
        tools: deps.tools,
        checkpoint: deps.checkpoint,
        taskId: task.id,
        skillId: task.skillId,
    };

    try {
        const result = await executeSkillGraph(skill, enrichedInput, engineCtx);

        if (result.success) {
            task.status = 'success';
            task.output = {
                files_affected: [],
                key_functions: [],
                dependencies_added: [],
                summary_text: result.summary,
            };

            // Save task output for next task
            deps.taskOutput.save(task.id, task.output);

            // Save to semantic memory if available
            if (deps.semanticMemory && result.summary) {
                await deps.semanticMemory.safeAdd(result.summary, {
                    taskId: task.id,
                    skillId: task.skillId,
                });
            }

            logger.info('TaskAgent', `Task "${task.id}" completed successfully`);
        } else {
            task.status = 'failed';
            task.retryCount++;
            logger.error('TaskAgent', `Task "${task.id}" failed: ${result.error}`);
        }
    } catch (err: any) {
        task.status = 'failed';
        task.retryCount++;
        logger.error('TaskAgent', `Task "${task.id}" threw: ${err.message}`);
    }
}

/**
 * Execute a task without a skill by making a direct LLM call.
 * Gathers context from previous task outputs and asks the LLM to
 * analyze/summarize based on the task input.
 */
async function runDirectLLMTask(task: Task, deps: TaskAgentDeps): Promise<void> {
    logger.info('TaskAgent', `Task "${task.id}" has no skill — running direct LLM summarization`);
    task.status = 'running';

    // Gather context from previous task outputs
    const previousOutput = deps.taskOutput.loadPrevious(task.id);
    let contextBlock = '';
    if (previousOutput) {
        contextBlock = `\nPREVIOUS TASK OUTPUT:\n${JSON.stringify(previousOutput, null, 2)}`;
    }

    const systemPrompt = deps.config?.systemPrompts?.taskAgent || 'You are a coding assistant. Analyze the provided context and answer the user task. Respond with a clear, detailed summary. Use RAW JSON with a single "summary" field.';

    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: systemPrompt,
        },
        {
            role: 'user',
            content: `TASK: ${task.input}${contextBlock}\n\nProvide your analysis as JSON: {"summary": "...your detailed analysis..."}`,
        },
    ];

    logger.block('TaskAgent', `DIRECT LLM TASK "${task.id}" — PROMPT`, messages.map(m => `[${m.role}]\n${m.content}`).join('\n---\n'));

    try {
        const llmResponse = await deps.llm.complete(messages, { jsonMode: true, temperature: 0.3 });

        if (llmResponse.thinking) {
            logger.block('TaskAgent', `DIRECT LLM TASK "${task.id}" — THINKING`, llmResponse.thinking);
        }

        // Parse summary from response
        let summaryText = llmResponse.content;
        try {
            const { sanitizeLLMJson } = require('../core/json-sanitizer');
            const sanitized = sanitizeLLMJson(llmResponse.content);
            const parsed = JSON.parse(sanitized);
            summaryText = parsed.summary ?? JSON.stringify(parsed);
        } catch {
            // Use raw content if JSON parsing fails
            logger.warn('TaskAgent', `Task "${task.id}" — direct LLM response not parseable as JSON, using raw`);
        }

        logger.block('TaskAgent', `DIRECT LLM TASK "${task.id}" — RESULT`, summaryText);

        task.status = 'success';
        task.output = {
            files_affected: [],
            key_functions: [],
            dependencies_added: [],
            summary_text: summaryText,
        };

        // Save task output for downstream tasks
        deps.taskOutput.save(task.id, task.output);

        // Save to semantic memory if available
        if (deps.semanticMemory && summaryText) {
            await deps.semanticMemory.safeAdd(summaryText, {
                taskId: task.id,
                skillId: 'direct_llm',
            });
        }

        logger.info('TaskAgent', `Task "${task.id}" completed successfully (direct LLM)`);
    } catch (err: any) {
        task.status = 'failed';
        task.retryCount++;
        logger.error('TaskAgent', `Task "${task.id}" direct LLM threw: ${err.message}`);
    }
}
