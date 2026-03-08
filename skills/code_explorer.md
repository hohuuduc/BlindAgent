---
name: code_explorer
description: Search Files -> Read & Analyze Structure -> Summarize -> Save to Memory
version: 1.1.0
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
      - target: read_files

  - id: read_files
    tool: read_file
    prompt_template: read_files_prompt
    output_schema:
      type: object
      properties:
        path:
          type: string
    edges:
      - target: analyze_structure

  - id: analyze_structure
    tool: llm
    prompt_template: analyze_structure_prompt
    output_schema:
      type: object
      properties:
        components:
          type: array
          items:
            type: object
            properties:
              name:
                type: string
              type:
                type: string
              purpose:
                type: string
        relationships:
          type: array
          items:
            type: string
    edges:
      - target: summarize

  - id: summarize
    tool: llm
    prompt_template: summarize_prompt
    output_schema:
      type: object
      properties:
        summary:
          type: string
        tags:
          type: array
          items:
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

### read_files_prompt
Given the search results from the previous step:
{{lastOutput}}

Pick the most important file to read for analysis. Return a JSON with the `path` to read.
Example output:
```json
{
  "path": "./src/core/engine.ts"
}
```

### analyze_structure_prompt
Analyze the following source code content and extract the architectural structure.
Identify all exported functions, classes, interfaces, and their purposes.

Source content:
{{lastOutput}}

User task context: "{{taskInput}}"

Return a JSON object with:
- `components`: array of objects with `name`, `type` (function/class/interface/constant), and `purpose`
- `relationships`: array of strings describing how components interact

Example output:
```json
{
  "components": [
    {"name": "Engine", "type": "class", "purpose": "Orchestrates skill graph execution"},
    {"name": "executeNode", "type": "function", "purpose": "Dispatches node to correct handler"}
  ],
  "relationships": ["Engine calls executeNode for each graph step"]
}
```

### summarize_prompt
Based on the structural analysis below, generate a high-level summary of the codebase.

Analysis data:
{{lastOutput}}

User task context: "{{taskInput}}"

Return a JSON object with `summary` (concise text) and `tags` (relevant keywords).
Example output:
```json
{
  "summary": "The core directory contains the execution engine and skill loader. The engine reads parsed skills and executes them node-by-node with crash recovery.",
  "tags": ["core", "engine", "loader", "state-machine", "architecture"]
}
```
