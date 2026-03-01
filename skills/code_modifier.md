---
name: code_modifier
description: Read File -> AST Chunk -> Generate Diff -> Validate Diff -> Apply -> Summarize
version: 1.0.0
nodes:
  - id: read_file
    tool: file_reader
    prompt_template: read_file_prompt
    output_schema:
      type: object
      properties:
        content:
          type: string
        file_path:
          type: string
    edges:
      - target: chunk_ast

  - id: chunk_ast
    tool: ast_chunker
    prompt_template: chunk_ast_prompt
    output_schema:
      type: object
      properties:
        chunks:
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
    edges:
      - target: validate_diff

  - id: validate_diff
    tool: diff_validator
    prompt_template: validate_diff_prompt
    output_schema:
      type: object
      properties:
        is_valid:
          type: boolean
        reason:
          type: string
    edges:
      - target: apply_diff
        condition: 'is_valid'
      - target: generate_diff
        condition: '!is_valid'

  - id: apply_diff
    tool: patch_applier
    prompt_template: apply_diff_prompt
    output_schema:
      type: object
      properties:
        applied:
          type: boolean
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
Identify the file that needs to be modified and determine its relative path. Return the file path to explicitly instruct the system to read it.
Return a JSON object containing the `file_path`.
Example format:
```json
{
  "file_path": "./src/utils/math.ts"
}
```

### chunk_ast_prompt
Given the entire file content, utilize AST-based chunking to split the source code into meaningful semantic blocks, allowing for easier diff creation.
Return an array of chunks representing functions, interfaces, and classes.
Example format:
```json
{
  "chunks": ["[CHUNK_1_START]...", "[CHUNK_2_START]..."]
}
```

### generate_diff_prompt
Generate the necessary modifications referencing the task constraints. 
You MUST provide the changes exclusively in Unified Diff format (`--- a/file` and `+++ b/file` standard diff syntax). No surrounding explanation is allowed.
Return a valid JSON object with `unified_diff` property.
Example format:
```json
{
  "unified_diff": "--- a/src/math.ts\n+++ b/src/math.ts\n@@ -1,3 +1,3 @@\n-export function add(a, b) { return a + b; }\n+export function add(a: number, b: number): number { return a + b; }"
}
```

### validate_diff_prompt
Validate whether the generated unified diff string is strictly formatted correctly without corruption and can be safely applied to the original chunks.
Return a JSON object containing `is_valid` boolean flag and a `reason` if it's invalid.
Example format:
```json
{
  "is_valid": true,
  "reason": ""
}
```

### apply_diff_prompt
Apply the validated unified diff patch sequence back to the original source file safely. Save the outcome to the disk.
Return a JSON object asserting `applied: true` upon success.
Example format:
```json
{
  "applied": true
}
```

### summarize_prompt
Provide a brief summary of how the file was modified and what bugs or features were addressed using the diff approach.
Return a JSON object with the summary text.
Example format:
```json
{
  "summary": "Updated add function signature with correct TypeScript typings in math.ts via a unified diff block."
}
```
