import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTask, TaskAgentDeps } from '../src/agents/task-agent';
import { Task, AppConfig } from '../src/core/types';
import { executeSkillGraph } from '../src/core/engine';

// Mock engine executeSkillGraph
vi.mock('../src/core/engine', () => ({
    executeSkillGraph: vi.fn(),
}));

describe('TaskAgent - Reflect and Retry loop', () => {
    let mockDeps: any;
    let mockTask: Task;

    beforeEach(() => {
        vi.clearAllMocks();

        // 1. Setup mock deps
        mockDeps = {
            llm: {
                complete: vi.fn(),
            },
            skills: {
                get: vi.fn().mockReturnValue({ name: 'mock_skill', nodes: new Map() }),
            },
            tools: {},
            checkpoint: {},
            taskOutput: {
                save: vi.fn(),
                loadPrevious: vi.fn(),
            },
            config: {
                reflections: {
                    maxAttempts: 2,
                }
            } as any
        };

        // 2. Setup mock task
        mockTask = {
            id: 'task_1',
            title: 'Mock Task',
            skillId: 'mock_skill',
            input: 'Do something',
            dependencies: [],
            status: 'queued',
            retryCount: 0,
        };
    });

    it('should reflect and retry when a skill-based task fails', async () => {
        const executeSpy = vi.mocked(executeSkillGraph);

        // First attempt: simulate engine failure
        executeSpy.mockResolvedValueOnce({
            success: false,
            finalOutput: null,
            summary: '',
            error: 'Simulated tool failure',
        } as any);

        // Second attempt: simulate engine success
        executeSpy.mockResolvedValueOnce({
            success: true,
            finalOutput: { done: true },
            summary: 'Task completed successfully after retry',
        } as any);

        // Mock LLM reflection response
        mockDeps.llm.complete.mockResolvedValueOnce({
            content: JSON.stringify({
                root_cause: 'The simulated tool failed because of bad input.',
                alternative_approach: 'Try using correct input.'
            }),
            thinking: 'Thinking about the failure...'
        });

        // Run task
        await runTask(mockTask, mockDeps as TaskAgentDeps);

        // Assertions
        expect(executeSpy).toHaveBeenCalledTimes(2); // Initial attempt + 1 retry

        // The task should eventually be marked as success
        expect(mockTask.status).toBe('success');

        // Check if failureContext was correctly populated
        expect(mockTask.failureContext).toBeDefined();
        expect(mockTask.failureContext).toHaveLength(1);
        expect(mockTask.failureContext![0]).toEqual({
            attempt: 1,
            error: 'Simulated tool failure',
            rootCause: 'The simulated tool failed because of bad input.',
            alternativeApproach: 'Try using correct input.'
        });

        // Check if input was enriched with the reflection
        expect(mockTask.input).toContain('[REFLECTION from attempt 1]');
        expect(mockTask.input).toContain('Root cause: The simulated tool failed');
        expect(mockTask.input).toContain('Revised approach: Try using correct input');
    });

    it('should exhaust max attempts and fail the task', async () => {
        const executeSpy = vi.mocked(executeSkillGraph);

        // Simulate persistent failure (3 attempts total: 1 initial + 2 retries)
        executeSpy.mockResolvedValue({
            success: false,
            finalOutput: null,
            summary: '',
            error: 'Persistent error',
        } as any);

        // Mock LLM reflection for each failure
        mockDeps.llm.complete.mockResolvedValue({
            content: JSON.stringify({
                root_cause: 'Still failing',
                alternative_approach: 'Keep trying'
            })
        });

        await runTask(mockTask, mockDeps as TaskAgentDeps);

        expect(executeSpy).toHaveBeenCalledTimes(3); // 1 + maxAttempts(2)
        expect(mockTask.status).toBe('failed');
        expect(mockTask.failureContext).toHaveLength(2); // Records for attempt 1 and 2
    });
});
