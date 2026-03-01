---
name: code_explorer
description: Scan Directory -> AST Extract -> Summarize -> Save to Semantic Memory
version: 1.0.0
nodes:
  - id: scan_dir
    tool: scan_directory
    prompt_template: scan_dir_prompt
    output_schema:
      type: object
      properties:
        files:
          type: array
          items:
            type: string
    edges:
      - target: extract_ast

  - id: extract_ast
    tool: extract_ast
    prompt_template: extract_ast_prompt
    output_schema:
      type: object
      properties:
        ast_data:
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
Review the task and determine which directory needs to be scanned to understand the codebase structure.
Respond with a JSON object containing the directory path.
Example output:
```json
{
  "directory": "./src/core"
}
```

### extract_ast_prompt
Given the directory structure, identify the key TypeScript files and extract their AST (Abstract Syntax Tree) overviews.
You must return a JSON object containing a list of files to parse.
Example output:
```json
{
  "target_files": ["./src/core/engine.ts", "./src/core/loader.ts"]
}
```

### summarize_prompt
Analyze the provided AST information and generate a high-level summary of the codebase structure. Highlight the main components and how they interact.
Your output must be strictly in JSON format matching the schema.
Example output:
```json
{
  "summary": "The core directory contains the main execution engine and skill loader. The engine reads parsed skills from the loader.",
  "tags": ["core", "engine", "loader", "architecture"]
}
```
