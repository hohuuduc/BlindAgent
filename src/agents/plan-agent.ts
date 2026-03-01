// src/agents/plan-agent.ts
// Plan Agent — Constrained Planner.
// Receives user request + available skills → outputs a structured task list.

import { z } from 'zod';
import { Task, ChatMessage } from '../core/types';
import { LLMProvider } from '../core/llm-provider';
import { SkillRegistry } from '../skills/registry';
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

function buildSystemPrompt(skillSummaries: { name: string; description: string }[]): string {
    const skillList = skillSummaries
        .map(s => `  - "${s.name}": ${s.description}`)
        .join('\n');

    return `You are a project planning assistant. Given a user request, break it down into a sequential list of tasks.

AVAILABLE SKILLS:
${skillList}

RULES:
1. Each task MUST use one of the available skills (set skill_id to the skill name).
2. If no skill matches a sub-task, set skill_id to null.
3. Tasks execute sequentially. Use dependencies to indicate ordering.
4. Keep task descriptions specific and actionable.
5. Respond with RAW JSON only. No markdown. No explanation.

OUTPUT FORMAT:
{
  "tasks": [
    {"id": "task_1", "title": "...", "skill_id": "...", "input": "...", "dependencies": []},
    {"id": "task_2", "title": "...", "skill_id": "...", "input": "...", "dependencies": ["task_1"]}
  ]
}`;
}

// ─── Few-shot Examples ──────────────────────────────────────

const FEW_SHOT_EXAMPLES: { input: string; output: string }[] = [
    {
        input: 'Create a utility file that exports a function to format dates.',
        output: JSON.stringify({
            tasks: [
                { id: 'task_1', title: 'Explore existing codebase', skill_id: 'code_explorer', input: 'Scan the project to understand existing code structure and conventions.', dependencies: [] },
                { id: 'task_2', title: 'Create date utility file', skill_id: 'code_writer', input: 'Create src/utils/date-formatter.ts that exports a formatDate(date: Date, format: string): string function.', dependencies: ['task_1'] },
            ],
        }),
    },
    {
        input: 'Fix the TypeError in auth.ts at line 42.',
        output: JSON.stringify({
            tasks: [
                { id: 'task_1', title: 'Debug the TypeError', skill_id: 'error_debugger', input: 'Analyze and fix TypeError in auth.ts at line 42.', dependencies: [] },
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
): Promise<Task[]> {
    logger.info('PlanAgent', `Generating plan for: "${userRequest.slice(0, 80)}..."`);

    const skillSummaries = skills.listSummaries();
    const systemPrompt = buildSystemPrompt(skillSummaries);

    // Build messages with few-shot examples
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
    ];

    for (const ex of FEW_SHOT_EXAMPLES) {
        messages.push({ role: 'user', content: ex.input });
        messages.push({ role: 'assistant', content: ex.output });
    }

    messages.push({ role: 'user', content: userRequest });

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
    return tasks;
}
