# BlindAgent: Strategic Reasoning Cache
**Version:** 1.2 (Project Renamed, Manual Test Scenarios Added)

## 1. System Blueprint

### App Description & Functions
**BlindAgent** is a modular, state-machine-driven AI Agent Framework built in Node.js + TypeScript, specifically designed to orchestrate lightweight, local LLMs (e.g., `gpt-oss:20b` via Ollama).
**Core Features:**
- **Constrained Planning:** A `PlanAgent` breaks down user requests into sequential tasks, mapped strictly to available skills (prevents hallucinated tool selection).
- **Skill Execution Engine:** A deterministic state machine (`Engine`) that executes YAML/Markdown-defined `SkillGraphs` (nodes: llm, tool, human_input).
- **Resilient Memory System:** Four distinct layers: `WorkingMemory` (lifecycle slots: `ephemeral`, `carry-over`, `persistent`), `CheckpointManager` (crash recovery via WAL SQLite), `EpisodicMemory` (error learning), `SemanticMemory` (vector embeddings).
- **Robust Output Handling:** A `json-sanitizer.ts` pipeline to repair and parse messy markdown-wrapped JSON from smaller LLMs.
- **Safe Execution:** Sandboxed terminal tools with whitelisting, blacklisting, and timeouts.
- **Full Observability Logging:** Dual-output logger (console + file) with `logBlock()` for large payloads. Captures LLM thinking traces, prompt/response pairs, tool I/O to daily log files (`log/agent-YYYY-MM-DD.log`).

### Source Structure
- `src/core/`: Foundation (`engine.ts`, `llm-provider.ts`, `json-sanitizer.ts`, `prompt-renderer.ts`, `config.ts`, `types.ts`).
  - `types.ts` exports `LLMResponse` (content + thinking + raw), `CompletionOptions` (includes `think` parameter for reasoning models).
  - `llm-provider.ts`: `complete()` returns `Promise<LLMResponse>`. `OllamaProvider` captures `message.thinking` and logs via `logger.block()`.
- `src/agents/`: High-level orchestration (`plan-agent.ts`, `task-agent.ts`).
- `src/memory/`: Storage systems (`working.ts`, `checkpoint.ts`, `semantic.ts`, `episodic.ts`, `task-output.ts`).
- `src/skills/`: Skill loading/validation from Markdown (`loader.ts`, `registry.ts`, `validator.ts`).
- `src/tools/`: Tool implementations and registry (`registry.ts`, `terminal.ts`, `file-ops.ts`, `syntax-check.ts`, `ast-parser.ts`).
- `src/utils/`: `logger.ts` (dual console+file, `logBlock` for file-only payloads), `token-counter.ts`.
- `skills/`: Declarative skill definitions (`*.md` — `code_explorer`, `code_writer`, `code_modifier`, `error_debugger`).
- `tests/manual/`: Three structured manual QA scenarios ordered by complexity:
  - `01_easy_code_exploration/`: LLM reads and summarizes `llm-provider.ts`, testing `code_explorer` skill + tool-chain.
  - `02_medium_feature_addition/`: LLM adds a cache layer to `token-counter.ts`, testing multi-step write + syntax-check pipeline.
  - `03_hard_system_refactoring/`: LLM adds a new `session` lifecycle to core `types.ts` + `WorkingMemory`, testing cross-file awareness.
- `tests/integration/`: Automated E2E tests (`ollama-e2e.test.ts`) verifying `structuredOutput`, `PlanAgent`, and `Engine` against a live Ollama instance.
- `log/`: Runtime log output (gitignored). Daily files: `agent-YYYY-MM-DD.log`.

## 2. Deep Reasoning Insights

### Challenge 1: LLM "Formatting Hallucinations" (Small Models)
- **Problem:** 20B models frequently wrap JSON in markdown or append conversational text, breaking `JSON.parse` and `Zod`.
- **Solution:** `json-sanitizer.ts` strips markdown blocks via Regex, locates the outermost `{`/`[`, then runs `jsonrepair`. On failure, `OllamaProvider` auto-retries with an explicit "RAW JSON ONLY" correction prompt.

### Challenge 2: Context Window Overflow (AST Parsing)
- **Problem:** Feeding entire files to 20B model blows out the token budget.
- **Solution:** `ast-parser.ts` (`ts-morph`) applies cascading degradation per token budget: Phase 1 (full body) → Phase 2 (block split) → Phase 3 (signature only).

### Challenge 3: Crash Recovery & State Persistence
- **Problem:** Mid-task crashes meant total loss of progress.
- **Solution:** `CheckpointManager` serializes `WorkingMemory` + current node to SQLite WAL on every node transition. `index.ts` detects incomplete checkpoints on startup and offers resume.

### Challenge 4: Observability Without Console Noise
- **Problem:** Debugging requires inspecting full LLM prompts and thinking traces — printing all of it overwhelms the user.
- **Solution:** `logger.ts` dual-output. `log()` → console + file (structured events). `logBlock()` → file only (large payloads: prompts, thinking, tool results). `complete()` returns `LLMResponse` (not `string`) to propagate thinking traces throughout the stack without discarding them at the provider boundary.

## 3. Decision Logic

- **`Zod` over JSON Schema:** Native TypeScript integration; derive types from schemas, catch alignment errors at compile time.
- **`better-sqlite3` over JSON files:** ACID + WAL mode for crash-safe checkpointing and episodic memory.
- **Markdown for Skills:** Separates agent logic from code. Non-developers can edit skills without touching TypeScript.
- **`LLMResponse` over plain `string`:** Preserves thinking trace + raw API data across the call stack; avoids the anti-pattern of discarding metadata at the provider boundary.
- **`logBlock()` over verbosity flags:** Simplicity. Dual-mode (console for events, file for data) maps cleanly to operational vs. debugging workflows.
- **Trade-offs Accepted:** Strict Zod parsing + auto-retry adds latency. `appendFileSync` for logging is synchronous but acceptable given LLM call dominates latency.

## 4. Pattern Recognition & Anti-Patterns

### Anti-Patterns to Avoid
1. **Implicit LLM Fallbacks:** Always pipe output through `json-sanitizer` + Zod. Never silently swallow format errors.
2. **Unbounded Memory Accumulation:** Never dump raw file contents into context. Use `WorkingMemory` lifecycle tags to enforce GC.
3. **Unsafe Shell Execution:** All terminal commands must go through `tools/terminal.ts` (whitelist + blacklist + timeout).
4. **Discarding LLM Metadata at Provider Boundary:** `complete()` must return `LLMResponse` — never only `string`.
5. **Console-Dumping Large Payloads:** Route full prompts/responses to file via `logger.block()`, not `console.log()`.

### Evolved Identity
> *I am the Principal Architect of **BlindAgent** — a state-machine-driven AI Agent Framework engineered for lightweight local LLMs. I hold deep, specialized knowledge of this system: from the lifecycle-managed `WorkingMemory` and WAL-backed `CheckpointManager` to the cascading AST-chunking strategy, JSON sanitization pipeline, and dual-output observability logger. I prioritize rigorous state management, crash resilience, bounded context, and operational debuggability. My decisions always favor architectural clarity, strict type safety, and predictable structured output over raw LLM freedom.*

