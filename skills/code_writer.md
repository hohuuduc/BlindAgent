---
name: code_writer
description: Analyze Spec -> Draft Code -> Validate Syntax -> [Fix Loop max 3] -> Human Fix -> Write File -> Summarize
version: 1.1.0
nodes:
  - id: analyze_spec
    tool: llm
    prompt_template: analyze_spec_prompt
    output_schema:
      type: object
      properties:
        spec_analysis:
          type: string
        requirements:
          type: array
          items:
            type: string
        file_path:
          type: string
    edges:
      - target: draft_code

  - id: draft_code
    tool: llm
    prompt_template: draft_code_prompt
    output_schema:
      type: object
      properties:
        file_path:
          type: string
        code_content:
          type: string
    edges:
      - target: validate_syntax

  - id: validate_syntax
    tool: syntax_check
    prompt_template: validate_syntax_prompt
    output_schema:
      type: object
      properties:
        code:
          type: string
        filename:
          type: string
    edges:
      - target: fix_syntax
        condition: 'result.valid === false'
      - target: write_file
        condition: 'result.valid === true'

  - id: fix_syntax
    tool: llm
    max_retries: 3
    prompt_template: fix_syntax_prompt
    output_schema:
      type: object
      properties:
        fixed_code:
          type: string
    edges:
      - target: validate_syntax
        condition: 'state.retryCount < 3'
      - target: human_fix
        condition: 'state.retryCount >= 3'

  - id: human_fix
    tool: human_input
    prompt_template: human_fix_prompt
    promptUser: "The system failed to auto-fix syntax errors after 3 attempts. Please provide corrected code or type 'skip' to skip."
    display: error
    output_schema:
      type: object
      properties:
        human_approved_code:
          type: string
    edges:
      - target: write_file

  - id: write_file
    tool: write_file
    prompt_template: write_file_prompt
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

### analyze_spec_prompt
Analyze the user request and generate a structured development specification.

User request: "{{taskInput}}"

Detail the core logic required, assumptions, and the target file path.
Return a JSON with `spec_analysis` (description), `requirements` (list), and `file_path` (target output path).
Example output:
```json
{
  "spec_analysis": "The user needs a mathematical utility class with basic arithmetic operations and error handling.",
  "requirements": ["addition method", "subtraction method", "division with zero-check", "JSDoc comments"],
  "file_path": "./src/utils/math.ts"
}
```

### draft_code_prompt
Based on the specification below, draft complete, production-quality TypeScript code.

Specification:
{{lastOutput}}

Requirements:
- Follow clean architecture principles
- Add proper JSDoc comments on all exports
- Include proper TypeScript type annotations
- Handle edge cases and errors

Return a JSON with `file_path` and `code_content`.
Example output:
```json
{
  "file_path": "./src/utils/math.ts",
  "code_content": "/**\n * Mathematical utility class.\n */\nexport class MathUtils {\n  /** Add two numbers. */\n  add(a: number, b: number): number { return a + b; }\n}"
}
```

### validate_syntax_prompt
Extract the drafted code for syntax validation by the syntax_check tool.

Previous output:
{{lastOutput}}

Return a JSON with `code` (the TypeScript source) and `filename` (the target filename for context).
Example output:
```json
{
  "code": "export class MathUtils {\n  add(a: number, b: number): number { return a + b; }\n}",
  "filename": "math.ts"
}
```

### fix_syntax_prompt
The drafted code contains syntax or type errors. Fix them.

Syntax check errors:
{{lastOutput}}

Original code context:
{{summary}}

Analyze each error message carefully and provide the corrected code.
Return a JSON with `fixed_code` containing the complete corrected TypeScript source.
Example output:
```json
{
  "fixed_code": "export class MathUtils {\n  add(a: number, b: number): number { return a + b; }\n}"
}
```

### human_fix_prompt
The system failed to fix the syntax errors automatically after 3 attempts.
Please review the errors and provide a manual fix, or type 'skip' to proceed with the current code.

Current errors:
{{lastOutput}}

Return a JSON with `human_approved_code` containing the manually corrected code.
Example output:
```json
{
  "human_approved_code": "export class MathUtils { ... }"
}
```

### write_file_prompt
Write the final validated code to the target file.

Previous step output:
{{lastOutput}}

Accumulated context:
{{summary}}

Extract the file path and code content. Return a JSON with `path` and `content` for the write_file tool.
Example output:
```json
{
  "path": "./src/utils/math.ts",
  "content": "export class MathUtils {\n  add(a: number, b: number): number { return a + b; }\n}"
}
```

### summarize_prompt
Summarize the code generation process.

Process log:
{{summary}}

Return a JSON with a concise `summary` of: what file was created, what was implemented, and any issues encountered.
Example output:
```json
{
  "summary": "Created ./src/utils/math.ts with MathUtils class implementing add, subtract, and divide methods with full TypeScript types and JSDoc."
}
```
