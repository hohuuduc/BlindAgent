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

A skill file consists of two main parts:
1. **YAML Frontmatter**: Defines the skill metadata, nodes, and edges of the state machine.
2. **Markdown Body**: Defines the prompt templates for any `llm` nodes.

#### YAML Structure

The frontmatter configures the skill's identity and execution graph.

```markdown
---
name: my_new_skill
# The description should be a structured object to help the PlanAgent understand when to use it
description:
  purpose: "Brief explanation of what the skill does."
  use_cases: "Specific scenarios where the PlanAgent should select this skill."
  expected_output: "What the final output of the skill will be."
version: 1.0.0
nodes:
  - id: step_one
    tool: llm
    prompt_template: step_one_prompt
    output_schema:           # (Optional) JSON schema for LLM structued output
      type: object
      properties:
        thought: { type: string }
    edges:
      - target: step_two     # Go to step_two unconditionally

  - id: step_two
    tool: my_custom_tool     # Call a TypeScript tool registered in ToolRegistry
    edges:
      # Conditional routing based on the result of the tool
      - target: step_three
        condition: 'result.success === true'
      - target: step_one
        condition: 'result.success === false'
      
  - id: step_three
    tool: human_input        # Ask user for input
    promptUser: "Please review the changes."
    display: diff            # View mode (diff, code, error, text)
    edges: []                # Empty edges array marks the end of the skill
---
```

#### Node Properties
- **`id`**: Unique identifier for the node within the skill.
- **`tool`**: The mechanism to execute. Built-in tools include `llm`, `human_input`, `read_file`, `write_file`, `search_files`, `syntax_check`, and `run_command`.
- **`prompt_template`**: Name of the markdown section below containing the prompt (required for `llm` nodes, and can be used to let an LLM auto-generate parameters for other tools).
- **`edges`**: Defines the next nodes to execute. Contains `target` and an optional JS `condition` (evaluated against `result` and `state`).

#### Markdown Body (Prompt Templates)

The markdown body contains prompts used by the LLM. Each template starts with `### <template_name>`.

You can use Handlebars-style mustache variables to inject context from `WorkingMemory`:
- `{{taskInput}}`: The original request from the PlanAgent.
- `{{lastOutput}}`: The raw output from the immediately preceding node.
- `{{summary}}`: A deterministic execution summary of all past nodes (often used to build accumulated context).

```markdown
### step_one_prompt
You are a helpful assistant. Please analyze the user request.
User task: {{taskInput}}

Previous output (if any):
{{lastOutput}}

Respond with RAW JSON matching the requested schema.
```

## Testing
The project uses Vitest for unit and end-to-end integration testing.

Run standard tests:
```bash
npm test
```

## License
ISC
