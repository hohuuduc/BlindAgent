---
name: code_modifier
description: Read File -> Analyze Code -> Generate Diff -> Validate Diff -> Apply Changes -> Summarize
version: 1.1.0
nodes:
  - id: read_file
    tool: read_file
    prompt_template: read_file_prompt
    output_schema:
      type: object
      properties:
        path:
          type: string
    edges:
      - target: analyze_code

  - id: analyze_code
    tool: llm
    prompt_template: analyze_code_prompt
    output_schema:
      type: object
      properties:
        chunks:
          type: array
          items:
            type: object
            properties:
              name:
                type: string
              start_line:
                type: number
              end_line:
                type: number
              code:
                type: string
        target_chunks:
          type: array
          items:
            type: string
    edges:
      - target: generate_diff

  - id: generate_diff
    tool: llm
    prompt_template: generate_diff_prompt
    output_schema:
      type: object
      properties:
        unified_diff:
          type: string
        modified_content:
          type: string
    edges:
      - target: validate_diff

  - id: validate_diff
    tool: llm
    prompt_template: validate_diff_prompt
    output_schema:
      type: object
      properties:
        is_valid:
          type: boolean
        reason:
          type: string
        corrected_content:
          type: string
    edges:
      - target: apply_changes
        condition: 'result.is_valid === true'
      - target: generate_diff
        condition: 'result.is_valid === false'

  - id: apply_changes
    tool: write_file
    prompt_template: apply_changes_prompt
    output_schema:
      type: object
      properties:
        path:
          type: string
        content:
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
    edges: []
---

## Prompt Templates

### read_file_prompt
Given the user task: "{{taskInput}}"

Identify the file that needs to be modified. Return a JSON object with the `path` field.
Example output:
```json
{
  "path": "./src/utils/math.ts"
}
```

### analyze_code_prompt
Analyze the following source file and break it into logical semantic chunks (functions, classes, interfaces, import blocks).
Identify which chunks need modification based on the task.

File content:
{{lastOutput}}

User task: "{{taskInput}}"

Return a JSON with:
- `chunks`: array of objects with `name`, `start_line`, `end_line`, `code`
- `target_chunks`: array of chunk names that need to be modified

Example output:
```json
{
  "chunks": [
    {"name": "imports", "start_line": 1, "end_line": 5, "code": "import { z } from 'zod';"},
    {"name": "add", "start_line": 7, "end_line": 9, "code": "function add(a, b) { return a + b; }"}
  ],
  "target_chunks": ["add"]
}
```

### generate_diff_prompt
Generate the required code modifications based on the analysis.

Previous analysis:
{{lastOutput}}

User task: "{{taskInput}}"

You MUST provide:
1. `unified_diff`: The changes in standard Unified Diff format (`--- a/file`, `+++ b/file` with `@@` hunks)
2. `modified_content`: The complete new file content after applying the diff

Return a JSON object. No explanation outside JSON.
Example output:
```json
{
  "unified_diff": "--- a/src/math.ts\n+++ b/src/math.ts\n@@ -1,3 +1,3 @@\n-export function add(a, b) { return a + b; }\n+export function add(a: number, b: number): number { return a + b; }",
  "modified_content": "export function add(a: number, b: number): number { return a + b; }"
}
```

### validate_diff_prompt
Validate the generated diff and modified content for correctness.

Check for:
1. The diff syntax is properly formatted
2. The modified content compiles logically (no broken syntax)
3. The changes address the original task requirements

Generated output to validate:
{{lastOutput}}

Original task: "{{taskInput}}"

Return a JSON with `is_valid` (boolean), `reason` (string, empty if valid), and `corrected_content` (the fixed content if invalid, empty string if valid).
Example output:
```json
{
  "is_valid": true,
  "reason": "",
  "corrected_content": ""
}
```

### apply_changes_prompt
Apply the validated changes to the file.

Previous step output:
{{lastOutput}}

Extract the file path and final content. Return a JSON with `path` and `content` for the write_file tool.
Example output:
```json
{
  "path": "./src/utils/math.ts",
  "content": "export function add(a: number, b: number): number { return a + b; }"
}
```

### summarize_prompt
Summarize the code modification process.

Accumulated context:
{{summary}}

Last output:
{{lastOutput}}

Return a JSON with a concise `summary` describing: what file was modified, what changes were made, and why.
Example output:
```json
{
  "summary": "Modified ./src/utils/math.ts: Added TypeScript type annotations to the add function parameters and return type for type safety."
}
```
