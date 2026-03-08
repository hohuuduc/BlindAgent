# BlindAgent

A modular, state-machine-driven AI Agent Framework built in Node.js and TypeScript. This framework is specifically designed to orchestrate lightweight, local Large Language Models (LLMs) like `gpt-oss:20b` via Ollama, focusing on strict state management, prompt constraints, and crash resilience.

## Key Features

- **Constrained Planning**: Breaks down complex user requests into sequential tasks strictly mapped to predefined skills.
- **State Machine Engine**: Executes declarative `SkillGraphs` with deterministic transitions, tool calls, and LLM interactions.
- **Resilient Memory**: Features a 4-layer memory architecture:
  - `WorkingMemory` with specific lifecycles (`ephemeral`, `carry-over`, `persistent`).
  - `CheckpointManager` using SQLite WAL for seamless crash recovery.
  - `SemanticMemory` for vector-based search.
  - `EpisodicMemory` for tracking and learning from past errors.
- **Robust formatting**: Built-in `json-sanitizer` to repair markdown-wrapped or malformed JSON output from smaller LLMs.
- **Safe Sandboxing**: Terminal execution is strictly constrained by whitelists, blacklists, and timeouts.

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Ollama](https://ollama.ai/) running locally or accessible remotely.
- An Ollama model pulled locally (e.g., `ollama run gpt-oss:20b`).

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd agent
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up configuration:
   - Edit `config.yaml` to point to your specific Ollama instance and model.

### Usage
Run the CLI in development mode:
```bash
npm run dev
```

Or build and start the compiled version:
```bash
npm run build
npm start
```

Once running, the CLI will present a prompt where you can type your tasks. The `PlanAgent` will break your request into tasks, and the `TaskAgent` will execute them sequentially using the state machine engine.

## Extending the Framework

The framework is highly modular. You can easily extend its capabilities by adding new **Tools** or **Skills**.

### 1. Adding a New Tool
Tools are TypeScript functions wrapped with Zod schemas for strict parameter validation. Add new tools in `src/tools/` and register them in `src/index.ts`.

Example tool definition:
```typescript
import { z } from 'zod';
import { ToolResult } from './registry';

export const myNewTool = {
    name: 'calculate_sum',
    description: 'Calculates the sum of two numbers.',
    schema: z.object({
        a: z.number(),
        b: z.number()
    }),
    execute: async (params: { a: number, b: number }): Promise<ToolResult> => {
        return { success: true, output: { result: params.a + params.b } };
    }
};
```
Don't forget to register it in your `index.ts`:
```typescript
tools.register(myNewTool);
```

### 2. Adding a New Skill
Skills are defined declaratively using **Markdown files** located in the `skills/` directory. No TypeScript changes are needed to add a new skill!

A skill file consists of:
1. **YAML Frontmatter**: Defines the nodes and edges of the state machine.
2. **Markdown Body**: Defines the prompt templates for any `llm` nodes.

Example `skills/calculator_skill.md`:
```markdown
---
name: calculator_skill
description: Parses a user request and calculates the sum.
version: 1.0.0
nodes:
  - id: extract_numbers
    tool: llm
    prompt_template: extract_prompt
    output_schema: 
      type: object
      properties:
        a: { type: number }
        b: { type: number }
    edges:
      - target: calculate

  - id: calculate
    tool: calculate_sum # Maps to the tool we registered above
    edges: [] # End of graph
---

### extract_prompt
You are a helpful assistant. Extract the two numbers from the user's input.
User input: {{state.taskInput}}
Respond with RAW JSON: { "a": number, "b": number }
```

## Testing
The project uses Vitest for unit and end-to-end integration testing.

Run standard tests:
```bash
npm test
```

## License
ISC
