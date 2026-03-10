# BlindAgent: Strategic Reasoning Cache

## 1. System Blueprint

### App Description & Functions
**BlindAgent** is a modular, state-machine-driven AI Agent Framework built in Node.js + TypeScript, specifically designed to orchestrate lightweight, local LLMs (e.g., `gpt-oss:20b` via Ollama).
**Core Features:**
- **Constrained Planning:** A `PlanAgent` breaks down user requests into sequential tasks, mapped strictly to available skills, actively avoiding over-decomposition and `null` skill fallbacks.
- **Skill Execution Engine:** A deterministic state machine (`Engine`) that executes YAML/Markdown-defined `SkillGraphs` (nodes: llm, tool, human_input).
- **Resilient Memory System:** Four distinct layers: `WorkingMemory` (lifecycle slots), `CheckpointManager` (crash recovery via WAL SQLite), `EpisodicMemory` (error learning), and `SemanticMemory` (vector embeddings via `vectra` for historical context).
- **Graceful Degradation:** Optional dependencies (like embedding models for Semantic Memory) are health-probed on startup; the system falls back to a stateless mode rather than crashing if unavailable.
- **Robust Output Handling:** A `json-sanitizer.ts` pipeline to repair and parse messy markdown-wrapped JSON from smaller LLMs.
- **Safe Execution:** Sandboxed terminal tools with whitelisting, blacklisting, and timeouts.
- **Auto-Reflection & Retry:** When a task fails, the system triggers a reflection mechanism where the LLM analyzes the failure context (root cause) and devises an alternative approach, then retries the task with the enriched context, reducing manual intervention.
- **Full Observability Logging:** Dual-output logger (console + file) with `logBlock()` for large payloads. Traces are carefully selected to balance debuggability and log bloating.

### Source Structure
- `src/core/`: Foundation (`engine.ts`, `llm-provider.ts`, `json-sanitizer.ts`, `prompt-renderer.ts`, `config.ts`, `types.ts`).
- `src/agents/`: High-level orchestration (`plan-agent.ts`, `task-agent.ts`). Injects semantic context into prompts.
- `src/memory/`: Storage systems (`working.ts`, `checkpoint.ts`, `semantic.ts`, `episodic.ts`, `task-output.ts`). Includes safe wrappers for vector operations.
- `src/skills/`: Skill loading/validation from Markdown (`loader.ts`, `registry.ts`, `validator.ts`).
- `src/tools/`: Tool implementations and registry (`registry.ts`, `terminal.ts`, `file-ops.ts`, `syntax-check.ts`, `ast-parser.ts`).
- `skills/`: Declarative skill definitions (`*.md`). Rigidly defined boundaries (`code_explorer` for read-only, `code_writer` for creation, `code_modifier` for editing) to map intention precisely.

## 2. Deep Reasoning Insights

### Challenge 1: LLM "Formatting Hallucinations" (Small Models)
- **Problem:** 20B models frequently wrap JSON in markdown or append conversational text, breaking `JSON.parse` and `Zod`.
- **Solution:** `json-sanitizer.ts` strips markdown blocks via Regex, locates the outermost `{`/`[`, then runs `jsonrepair`. On failure, `OllamaProvider` auto-retries with an explicit "RAW JSON ONLY" correction prompt.

### Challenge 2: Context Window Overflow (AST Parsing)
- **Problem:** Feeding entire files to 20B model blows out the token budget.
- **Solution:** `ast-parser.ts` (`ts-morph`) applies cascading degradation: Phase 1 (full body) → Phase 2 (block split) → Phase 3 (signature only).

### Challenge 3: Crash Recovery & State Persistence
- **Problem:** Mid-task crashes meant total loss of progress.
- **Solution:** `CheckpointManager` serializes `WorkingMemory` + current node to SQLite WAL on every node transition. `index.ts` detects incomplete checkpoints on startup and offers resume.

### Challenge 4: Semantic Context Injection without Hard Dependencies
- **Problem:** We need to pull past task knowledge (via vectors) into the planning and execution phases natively, but we cannot guarantee that the user has pulled the specific local embedding model (e.g. `nomic-embed-text`) or that Ollama is healthy. If it fails, the whole agent shouldn't crash.
- **Solution:** Developed "Safe Wrappers" for the Vector DB (`safeAdd`, `safeSearch`) in `semantic.ts` and an explicit `llm.embed('health check')` logic in `index.ts`. If the embed model is unavailable, the `SemanticMemory` dependency gracefully degrades to `undefined`, allowing the agent to continue executing functionally without historical context.

### Challenge 5: Task Failure Recovery
- **Problem:** When tool execution or strict skill-based tasks failed, the agent traditionally marked the task as `failed` immediately, forcing the user to manually intervene, even if the error was a simple hallucinated file path or bad syntax.
- **Solution:** Integrated an automated **Reflect-and-Retry loop** within `task-agent.ts`. Upon failure, the agent queries the LLM with the task's original input plus the explicit error message, asking for a structured `root_cause` and `alternative_approach`. The task is then seamlessly retried with this injected reflection hint, enabling the agent to self-correct simple mistakes autonomously.

## 3. Decision Logic

- **Rigid Skill Boundaries:** We constrain the planner by explicitly preventing overlap in skill descriptions (e.g., specifying that `code_modifier` is NOT for read-only analysis). This forces the LLM to choose the exactly correct deterministic graph.
- **Null-Skill Avoidance:** We explicitly instructed the planner to avoid `null` skill fallbacks, forcing it to utilize the defined deterministic engine graphs rather than relying purely on zero-shot LLM reasoning for task execution.
- **Log Noise vs Observability:** We stopped block-logging extreme volumes (like the parsed structured output or the raw thinking trace in standard flow) by default because it bloated the log files (`agent-YYYY-MM-DD.log`). We traded granular step-by-step trace capture for higher signal-to-noise ratio in operational debugging.
- **`Zod` over JSON Schema:** Native TypeScript integration; derive types from schemas, catch alignment errors at compile time.
- **`better-sqlite3` over JSON files:** ACID + WAL mode for crash-safe checkpointing and episodic memory.

## 4. Pattern Recognition & Anti-Patterns

### Anti-Patterns to Avoid
1. **Over-decomposition in Planning:** Do not create multiple micro-tasks if one skill node graph can naturally process the workload. Let the deterministic tool sequence handle internal loops.
2. **Implicit LLM Fallbacks:** Always pipe output through `json-sanitizer` + Zod. Never silently swallow format errors.
3. **Hard Dependencies on External Models:** Never assume an embedding or specific LLM model is available; fail gracefully or fall back to basic operation.
4. **Unbounded Memory Accumulation:** Never dump raw file contents into context. Use `WorkingMemory` lifecycle tags to enforce GC.
5. **Console-Dumping Large Payloads:** Route full prompts/responses to file via `logger.block()`.

### Evolved Identity
> *I am the Principal Architect of **BlindAgent** — a state-machine-driven AI Agent Framework engineered for lightweight local LLMs. I hold deep, specialized knowledge of this system: from the lifecycle-managed `WorkingMemory` and WAL-backed `CheckpointManager` to the semantic vector retrieval, graceful capability degradation, and autonomous reflect-and-retry self-correction loops. I prioritize rigorous state management, strict planner constraints, bounded context, and operational debuggability. My decisions always favor architectural clarity, deterministic safety, and predictable structured output over raw LLM freedom.*
