// src/agents/plan-agent.ts
// Plan Agent — Constrained Planner.
// Receives user request + available skills → outputs a structured task list.

import { z } from 'zod';
import { Task, ChatMessage, AppConfig } from '../core/types';
import { LLMProvider } from '../core/llm-provider';
import { SkillRegistry } from '../skills/registry';
import { SemanticMemory } from '../memory/semantic';
import { logger } from '../utils/logger';

// ─── Output Schema ──────────────────────────────────────────

const PlanTaskSchema = z.object({
    id: z.string(),
    title: z.string(),
    skill_id: z.string().nullable(),
    input: z.string(),
    dependencies: z.array(z.string()).default([]),
});

const PlanOutputSchema = z.object({
    tasks: z.array(PlanTaskSchema),
});

export type PlanOutput = z.infer<typeof PlanOutputSchema>;

// ─── System Prompt ──────────────────────────────────────────

function buildSystemPrompt(skillSummaries: { name: string; description: string }[], template?: string): string {
    const skillList = skillSummaries
        .map(s => `  - "${s.name}": ${s.description}`)
        .join('\n');

    const baseTemplate = template || `You are a project planning assistant. Given a user request, break it down into a sequential list of tasks.

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
}`;

    return baseTemplate.replace('{{skillList}}', skillList);
}

// ─── Few-shot Examples ──────────────────────────────────────

const FEW_SHOT_EXAMPLES: { input: string; output: string }[] = [
    {
        input: 'Analyze the file src/core/engine.ts and explain how the retry mechanism works.',
        output: JSON.stringify({
            tasks: [
                { id: 'task_1', title: 'Analyze engine.ts retry mechanism', skill_id: 'code_explorer', input: 'Read and analyze src/core/engine.ts to understand and explain the retry mechanism in detail.', dependencies: [] },
                { id: 'task_final', title: 'Report final results', skill_id: null, input: 'Summarize the analysis of the retry mechanism from task_1 into a clear report for the user.', dependencies: ['task_1'] },
            ],
        }),
    },
    {
        input: 'Create a utility file that exports a function to format dates.',
        output: JSON.stringify({
            tasks: [
                { id: 'task_1', title: 'Explore existing codebase', skill_id: 'code_explorer', input: 'Scan the project to understand existing code structure and conventions.', dependencies: [] },
                { id: 'task_2', title: 'Create date utility file', skill_id: 'code_writer', input: 'Create src/utils/date-formatter.ts that exports a formatDate(date: Date, format: string): string function.', dependencies: ['task_1'] },
                { id: 'task_final', title: 'Report final results', skill_id: null, input: 'Summarize all completed tasks including code exploration and file creation into a final report for the user.', dependencies: ['task_1', 'task_2'] },
            ],
        }),
    },
];

// ─── Plan Agent ─────────────────────────────────────────────

/**
 * Generate a task plan from a user request.
 * Returns a list of Task objects ready for the task queue.
 */
export async function generatePlan(
    userRequest: string,
    llm: LLMProvider,
    skills: SkillRegistry,
    semanticMemory?: SemanticMemory,
    config?: AppConfig,
): Promise<Task[]> {
    logger.info('PlanAgent', `Generating plan for: "${userRequest.slice(0, 80)}..."`);

    const skillSummaries = skills.listSummaries();
    const systemPrompt = buildSystemPrompt(skillSummaries, config?.systemPrompts?.planAgent);

    // Build messages with few-shot examples
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
    ];

    // for (const ex of FEW_SHOT_EXAMPLES) {
    //     messages.push({ role: 'user', content: ex.input });
    //     messages.push({ role: 'assistant', content: ex.output });
    // }

    // Enrich with relevant past context from semantic memory
    let pastContextBlock = '';
    if (semanticMemory) {
        const relevant = await semanticMemory.safeSearch(userRequest, 3);
        if (relevant.length > 0) {
            const contextLines = relevant.map(
                (r, i) => `  ${i + 1}. [score=${r.score.toFixed(2)}] ${r.text.slice(0, 200)}`
            ).join('\n');
            pastContextBlock = `\n\nRELEVANT PAST CONTEXT (from previous tasks):\n${contextLines}`;
            logger.info('PlanAgent', `Injected ${relevant.length} semantic context items into planning prompt`);
        }
    }

    messages.push({ role: 'user', content: userRequest + pastContextBlock });

    // Get structured output
    const planOutput = await llm.structuredOutput(messages, PlanOutputSchema, {
        temperature: 0.1,
    });

    // Convert to Task objects
    const tasks: Task[] = planOutput.tasks.map(t => ({
        id: t.id,
        title: t.title,
        skillId: t.skill_id,
        input: t.input,
        dependencies: t.dependencies ?? [],
        status: 'queued' as const,
        retryCount: 0,
    }));

    logger.info('PlanAgent', `Generated ${tasks.length} tasks`);
    logger.block('PlanAgent', 'FINAL TASKS', tasks.map(t => `${t.id}: ${t.title} [${t.skillId}]`).join('\n'));
    return tasks;
}
