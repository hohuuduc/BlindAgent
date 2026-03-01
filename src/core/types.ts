// ============================================================
// Shared Types for Multi-Agent Framework
// This file contains all core interfaces used across modules.
// ============================================================

// --- Slot Lifecycle ---

export type SlotLifecycle = 'persistent' | 'carry-over' | 'ephemeral';

export interface SlotEntry {
    value: any;
    lifecycle: SlotLifecycle;
    /** Number of node transitions remaining before auto-delete (carry-over only) */
    ttl?: number;
}

// --- State Slots ---

/**
 * StateSlots manages working memory within a single task execution.
 * Slots are categorized by lifecycle:
 * - persistent: survives the entire task (e.g. taskInput, summary, targetFiles)
 * - carry-over: kept for N node transitions, then auto-deleted (e.g. lastOutput)
 * - ephemeral: deleted immediately after the current node completes (e.g. rawLlmResponse)
 */
export interface StateSlots {
    [slotName: string]: SlotEntry;
}

// --- Checkpoint (Crash Recovery) ---

/**
 * Checkpoint represents the full state of a task at a specific node transition.
 * Saved to SQLite before each node begins execution.
 * If the process crashes, the task can resume from this checkpoint.
 */
export interface Checkpoint {
    taskId: string;
    skillId: string;
    /** The node about to execute (not yet started) */
    currentNodeId: string;
    /** Serialized state slots */
    stateSlots: Record<string, any>;
    /** Rolling summary accumulated from previous nodes */
    summary: string;
    retryCount: number;
    timestamp: number;
}

// --- Task Summary (Output of summarize node) ---

export interface FileAffected {
    path: string;
    action: 'created' | 'modified' | 'analyzed';
    description: string;
}

export interface FunctionInfo {
    name: string;
    file: string;
    purpose: string;
}

/**
 * TaskSummary is the structured output of the final `summarize` node.
 * Stored in Semantic Memory and passed as Task Output to the next task.
 */
export interface TaskSummary {
    files_affected: FileAffected[];
    key_functions: FunctionInfo[];
    dependencies_added: string[];
    summary_text: string;
}

// --- Episodic Memory (Error patterns) ---

/**
 * ErrorEntry records a past error and its successful fix.
 * Used for few-shot prompting when similar errors occur again.
 */
export interface ErrorEntry {
    id?: number;
    /** Error type/name (e.g. "TypeError", "SyntaxError") */
    errorType: string;
    /** Error message content */
    errorMessage: string;
    /** File where the error occurred */
    file: string;
    /** Line number if available */
    line?: number;
    /** The fix that resolved this error (code snippet or description) */
    fix: string;
    /** Timestamp when this error was recorded */
    timestamp: number;
}

// --- Semantic Memory (Vector DB) ---

export interface SearchResult {
    text: string;
    score: number;
    metadata: Record<string, any>;
}

// --- Task Lifecycle ---

export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'retrying' | 'blocked' | 'skipped';

export interface Task {
    id: string;
    title: string;
    skillId: string | null;
    input: string;
    dependencies: string[];
    status: TaskStatus;
    retryCount: number;
    output?: TaskSummary;
}

// --- Skill Graph ---

export type NodeTool = 'llm' | 'human_input' | string;

export interface SkillEdge {
    target: string;
    condition: string;
}

export interface SkillNode {
    id: string;
    tool: NodeTool;
    promptTemplate?: string;
    outputSchema?: string;
    contextBudget?: number;
    maxRetries?: number;
    /** Slots to preserve beyond their normal lifecycle at this node */
    preserveSlots?: string[];
    /** For human_input nodes: how to render context */
    display?: 'diff' | 'code' | 'error' | 'text';
    /** For human_input nodes: prompt shown to user */
    promptUser?: string;
    edges: SkillEdge[];
}

export interface SkillGraph {
    name: string;
    description: string;
    version: string;
    nodes: Map<string, SkillNode>;
    promptTemplates: Map<string, string>;
}

// --- LLM Provider ---

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface CompletionOptions {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    stop?: string[];
}

// --- Config ---

export interface OllamaConfig {
    baseUrl: string;
    model: string;
    embedModel: string;
}

export interface BudgetConfig {
    systemPrompt: number;
    fewShot: number;
    taskContext: number;
    semanticQuery: number;
    codeChunk: number;
}

export interface RetryConfig {
    jsonFormat: number;
    nodeExecution: number;
}

export interface AppConfig {
    provider: 'ollama' | 'vllm' | 'openai';
    ollama: OllamaConfig;
    budgets: BudgetConfig;
    retries: RetryConfig;
}
