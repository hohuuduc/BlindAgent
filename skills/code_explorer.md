---
name: code_explorer
description:
  purpose: "Read, analyze, explicate, and summarize source code structure without mutating any files."
  use_cases: "ANY task that strictly requires understanding, exploring, or explaining code structure, algorithms, functions, or architecture. Single-file explanations must use this."
  expected_output: "A structured architectural breakdown and summary of the explored files."
nodes:
  - id: scan_dir
    tool: search_files
    prompt_template: scan_dir_prompt
    output_schema:
      type: object
      properties:
        directory:
          type: string
        extensions:
          type: array
          items:
            type: string
    edges:
      - target: read_file

  - id: read_file
    tool: read_file
    prompt_template: read_file_prompt
    output_schema:
      type: object
      properties:
        path:
          type: string
    edges:
      - target: pick_next

  - id: pick_next
    tool: llm
    prompt_template: pick_next_prompt
    output_schema:
      type: object
      properties:
        action:
          type: string
        next_file:
          type: string
        accumulated:
          type: string
    edges:
      - target: read_file
        condition: 'result.action === "read_more"'
      - target: analyze_structure
        condition: 'result.action === "analyze"'

  - id: analyze_structure
    tool: llm
    prompt_template: analyze_structure_prompt
    output_schema:
      type: object
      properties:
        files_affected:
          type: array
          items:
            type: object
            properties:
              path:
                type: string
              action:
                type: string
              description:
                type: string
        key_functions:
          type: array
          items:
            type: object
            properties:
              name:
                type: string
              file:
                type: string
              purpose:
                type: string
        summary_text:
          type: string
    edges: []
---

## Prompt Templates

### scan_dir_prompt
Given the user task: "{{taskInput}}"

Determine which directory and file types need to be scanned.
Return a JSON object with `directory` (string) and optionally `extensions` (array of file extensions without dots).
Example output:
```json
{
  "directory": "./src/core",
  "extensions": ["ts", "js"]
}
```

### read_file_prompt
Given the search results and accumulated context:

Search results (file list):
{{summary}}

Previous step output:
{{lastOutput}}

User task: "{{taskInput}}"

Pick the most important file to read next. Avoid re-reading files already listed in the accumulated context above.
Return a JSON with the `path` to read.
Example output:
```json
{
  "path": "./src/core/engine.ts"
}
```

### pick_next_prompt
You just read a file. Decide whether to read more files or proceed to analysis.

File content just read:
{{lastOutput}}

Files already explored (from accumulated summary):
{{summary}}

User task: "{{taskInput}}"

Rules:
- If you have read enough files to understand the codebase structure relevant to the task, set action to "analyze".
- If there are clearly important files remaining that are critical to understanding the architecture, set action to "read_more" and specify `next_file`.
- Maximum 5 files total. If you have already read 5 files, you MUST set action to "analyze".
- IMPORTANT: In `accumulated`, concatenate the previous summary with a brief description of the file just read (filename, key exports, purpose). This field will be saved to the summary slot for the next iteration.

Return a JSON:
```json
{
  "action": "analyze",
  "next_file": "",
  "accumulated": "1. engine.ts: State machine engine, exports executeSkillGraph()\n2. types.ts: Core interfaces (Task, SkillGraph, Checkpoint)"
}
```

Or to read more:
```json
{
  "action": "read_more",
  "next_file": "./src/core/types.ts",
  "accumulated": "1. engine.ts: State machine engine, exports executeSkillGraph()"
}
```

### analyze_structure_prompt
Analyze the codebase structure based on all explored files.

Accumulated file summaries:
{{summary}}

Last file content:
{{lastOutput}}

User task: "{{taskInput}}"

Provide a comprehensive architectural analysis. Return a JSON matching the TaskSummary format:
- `files_affected`: array of objects with `path`, `action` ("analyzed"), and `description`
- `key_functions`: array of objects with `name`, `file`, and `purpose`
- `summary_text`: concise overall architecture summary

Example output:
```json
{
  "files_affected": [
    {"path": "./src/core/engine.ts", "action": "analyzed", "description": "State machine engine for skill graph execution"},
    {"path": "./src/core/types.ts", "action": "analyzed", "description": "Core type definitions and interfaces"}
  ],
  "key_functions": [
    {"name": "executeSkillGraph", "file": "engine.ts", "purpose": "Orchestrates node-by-node execution with crash recovery"},
    {"name": "evaluateEdges", "file": "engine.ts", "purpose": "Determines next node based on edge conditions"}
  ],
  "summary_text": "The core module implements a state-machine engine that executes skill graphs node by node. It supports crash recovery via SQLite checkpoints and manages working memory with slot lifecycles."
}
```
