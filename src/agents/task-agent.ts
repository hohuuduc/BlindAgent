// src/agents/task-agent.ts
// Task Agent — receives a single task, loads its skill, and runs the engine.

import { Task, SkillGraph } from '../core/types';
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
}

/**
 * Execute a single task using its assigned skill.
 * Updates the task status in-place.
 */
export async function runTask(task: Task, deps: TaskAgentDeps): Promise<void> {
    logger.info('TaskAgent', `Starting task "${task.title}" (id: ${task.id})`);

    // Check if skill exists
    if (!task.skillId) {
        task.status = 'blocked';
        logger.warn('TaskAgent', `Task "${task.id}" has no skill assigned — blocked`);
        return;
    }

    const skill = deps.skills.get(task.skillId);
    if (!skill) {
        task.status = 'blocked';
        logger.warn('TaskAgent', `Skill "${task.skillId}" not found — task blocked`);
        return;
    }

    task.status = 'running';

    // Create engine context
    const engineCtx: EngineContext = {
        llm: deps.llm,
        tools: deps.tools,
        checkpoint: deps.checkpoint,
        taskId: task.id,
        skillId: task.skillId,
    };

    try {
        const result = await executeSkillGraph(skill, task.input, engineCtx);

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
                try {
                    await deps.semanticMemory.add(result.summary, {
                        taskId: task.id,
                        skillId: task.skillId,
                    });
                } catch (e: any) {
                    logger.warn('TaskAgent', `Failed to save to semantic memory: ${e.message}`);
                }
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
