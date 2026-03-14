// src/agents/task-agent.ts
// Task Agent - receives a single task, loads its skill, and runs the engine.
// Supports null-skill tasks via direct LLM summarization.
// On failure: calls reflectOnFailure() to get LLM root-cause analysis,
// enriches task input with the alternative approach, then retries.

import { Task, SkillGraph, ChatMessage, AppConfig, FailureRecord } from '../core/types';
import { executeSkillGraph, EngineContext, EngineResult } from '../core/engine';
import { SkillRegistry } from '../skills/registry';
import { LLMProvider } from '../core/llm-provider';
import { ToolRegistry } from '../tools/registry';
import { CheckpointManager } from '../memory/checkpoint';
import { TaskOutputManager } from '../memory/task-output';
import { SemanticMemory } from '../memory/semantic';
import { logger } from '../utils/logger';
import { sanitizeLLMJson } from '../core/json-sanitizer';

export interface TaskAgentDeps {
    llm: LLMProvider;
    skills: SkillRegistry;
    tools: ToolRegistry;
    checkpoint: CheckpointManager;
    taskOutput: TaskOutputManager;
    semanticMemory?: SemanticMemory;
    config?: AppConfig;
}

// ─── Reflection Helper ──────────────────────────────────────

/**
 * Ask the LLM to reflect on a failed task attempt.
 * Returns a structured explanation of root cause + alternative approach.
 * Falls back to a simple string if JSON parsing fails.
 */
async function reflectOnFailure(
    task: Task,
    errorMessage: string,
    attemptNumber: number,
    deps: TaskAgentDeps,
): Promise<{ rootCause: string; alternativeApproach: string }> {
    logger.info('TaskAgent', `Reflecting on failure for task "${task.id}" (attempt ${attemptNumber})`);

    // Build failure history block for multi-attempt context
    const historyBlock = (task.failureContext ?? [])
        .map(r => `  Attempt ${r.attempt}: ${r.error}\n  Root cause: ${r.rootCause}\n  Tried: ${r.alternativeApproach}`)
        .join('\n---\n');

    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: 'You are a debugging assistant. Analyze the failed task and provide a root cause analysis plus a concrete alternative approach. Respond with RAW JSON only.',
        },
        {
            role: 'user',
            content: [
                `TASK: ${task.title}`,
                `ORIGINAL INPUT: ${task.input}`,
                `FAILURE (attempt ${attemptNumber}): ${errorMessage}`,
                historyBlock ? `PREVIOUS ATTEMPTS:\n${historyBlock}` : '',
                '',
                'Respond with: {"root_cause": "...", "alternative_approach": "..."}',
                'Be specific. The alternative_approach should be a concrete modified instruction for the task.',
            ].filter(Boolean).join('\n'),
        },
    ];

    logger.block('TaskAgent', `REFLECT — task "${task.id}" attempt ${attemptNumber}`, messages[1].content);

    try {
        const response = await deps.llm.complete(messages, { jsonMode: true, temperature: 0.3 });

        if (response.thinking) {
            logger.block('TaskAgent', `REFLECT "${task.id}" — THINKING`, response.thinking);
        }

        const sanitized = sanitizeLLMJson(response.content);
        const parsed = JSON.parse(sanitized);

        const rootCause: string = parsed.root_cause ?? 'Unknown root cause';
        const alternativeApproach: string = parsed.alternative_approach ?? task.input;

        logger.info('TaskAgent', `Reflection for "${task.id}": root_cause="${rootCause.slice(0, 100)}"`);
        logger.block('TaskAgent', `REFLECT "${task.id}" — RESULT`, `Root cause: ${rootCause}\nAlternative: ${alternativeApproach}`);

        return { rootCause, alternativeApproach };
    } catch (err: any) {
        logger.warn('TaskAgent', `Reflection LLM call failed for "${task.id}": ${err.message} — using fallback`);
        return {
            rootCause: errorMessage,
            alternativeApproach: task.input,
        };
    }
}

// ─── Task Execution ─────────────────────────────────────────

/**
 * Execute a single task using its assigned skill.
 * If no skill is assigned, runs a direct LLM call with previous task context.
 * On failure, reflects on the error and retries up to config.reflections.maxAttempts times.
 * Updates the task status in-place.
 */
export async function runTask(task: Task, deps: TaskAgentDeps): Promise<void> {
    logger.info('TaskAgent', `Starting task "${task.title}" (id: ${task.id})`);

    const maxAttempts = (deps.config?.reflections?.maxAttempts ?? 2) + 1; // +1 for the initial attempt

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) {
            logger.info('TaskAgent', `Retrying task "${task.id}" after reflection (attempt ${attempt}/${maxAttempts})`);
            task.status = 'retrying';
        }

        const error = await runTaskOnce(task, deps);

        if (!error) {
            // Success — done
            return;
        }

        // Task failed — reflect if there are remaining attempts
        const remainingAttempts = maxAttempts - attempt;
        if (remainingAttempts <= 0) {
            logger.error('TaskAgent', `Task "${task.id}" exhausted all ${maxAttempts} attempts. Marking failed.`);
            task.status = 'failed';
            return;
        }

        // Reflect and enrich for next attempt
        const reflection = await reflectOnFailure(task, error, attempt, deps);

        const record: FailureRecord = {
            attempt,
            error,
            rootCause: reflection.rootCause,
            alternativeApproach: reflection.alternativeApproach,
        };

        task.failureContext = [...(task.failureContext ?? []), record];

        // Enrich task input with the alternative approach hint
        task.input = [
            task.input,
            `\n[REFLECTION from attempt ${attempt}]`,
            `Root cause: ${reflection.rootCause}`,
            `Revised approach: ${reflection.alternativeApproach}`,
        ].join('\n');

        logger.info('TaskAgent', `Task "${task.id}" enriched with reflection. Retrying...`);
    }
}

/**
 * Run task exactly once. Returns undefined on success, or the error string on failure.
 */
async function runTaskOnce(task: Task, deps: TaskAgentDeps): Promise<string | undefined> {
    // No skill assigned — run direct LLM summarization
    if (!task.skillId) {
        return runDirectLLMTask(task, deps);
    }

    const skill = deps.skills.get(task.skillId);
    if (!skill) {
        task.status = 'blocked';
        logger.warn('TaskAgent', `Skill "${task.skillId}" not found — task blocked`);
        // Return undefined so the outer loop doesn't retry a blocked (config-missing) task
        return undefined;
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
            return undefined;
        } else {
            task.retryCount++;
            const errMsg = result.error ?? 'Unknown engine failure';
            logger.error('TaskAgent', `Task "${task.id}" failed: ${errMsg}`);
            return errMsg;
        }
    } catch (err: any) {
        task.retryCount++;
        logger.error('TaskAgent', `Task "${task.id}" threw: ${err.message}`);
        return err.message as string;
    }
}

/**
 * Execute a task without a skill by making a direct LLM call.
 * Gathers context from previous task outputs and asks the LLM to
 * analyze/summarize based on the task input.
 * Returns undefined on success, or the error string on failure.
 */
async function runDirectLLMTask(task: Task, deps: TaskAgentDeps): Promise<string | undefined> {
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
    logger.info('TaskAgent', `Executing task "${task.id}"`);
    try {
        const llmResponse = await deps.llm.complete(messages, { jsonMode: true, temperature: 0.3 });

        if (llmResponse.thinking) {
            logger.block('TaskAgent', `DIRECT LLM TASK "${task.id}" — THINKING`, llmResponse.thinking);
        }

        // Parse summary from response
        let summaryText = llmResponse.content;
        try {
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
        return undefined;
    } catch (err: any) {
        task.retryCount++;
        logger.error('TaskAgent', `Task "${task.id}" direct LLM threw: ${err.message}`);
        return err.message as string;
    }
}
