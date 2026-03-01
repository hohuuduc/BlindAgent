---
name: code_writer
description: Analyze Spec -> Draft Code -> Validate Syntax -> [Fix Loop max 3] -> Human Fix -> Write File -> Summarize
version: 1.0.0
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
    tool: ts_morph_validate
    prompt_template: validate_syntax_prompt
    output_schema:
      type: object
      properties:
        is_valid:
          type: boolean
        errors:
          type: array
          items:
            type: string
    edges:
      - target: fix_syntax
        condition: '!is_valid'
      - target: write_file
        condition: 'is_valid'

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
        condition: 'retries_left > 0'
      - target: human_fix
        condition: 'retries_left == 0'

  - id: human_fix
    tool: human_input
    prompt_template: human_fix_prompt
    output_schema:
      type: object
      properties:
        human_approved_code:
          type: string
    edges:
      - target: write_file

  - id: write_file
    tool: file_writer
    prompt_template: write_file_prompt
    output_schema:
      type: object
      properties:
        success:
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

### analyze_spec_prompt
Analyze the provided user request and generate a structured specification. Detail the core logic required and any assumptions made.
Output must be a JSON object containing the `spec_analysis` and a list of `requirements`.
Example Output:
```json
{
  "spec_analysis": "The user needs a new mathematical utility class supporting basic arithmetic operations.",
  "requirements": ["addition method", "subtraction method", "error handling for division by zero"]
}
```

### draft_code_prompt
Based on the defined requirements, draft the TypeScript code. Ensure clean architecture and proper JSDoc comments.
Output strictly as a JSON object with `file_path` and `code_content`.
Example Output:
```json
{
  "file_path": "./src/utils/math.ts",
  "code_content": "export class MathUtils {\n  add(a: number, b: number) { return a + b; }\n}"
}
```

### validate_syntax_prompt
Run the `ts_morph_validate` tool to verify the syntax and types of the provided code drafted.
Return the validation result indicating whether `is_valid` is true and list any `errors`.
Example Output:
```json
{
  "is_valid": false,
  "errors": ["Type 'string' is not assignable to type 'number'"]
}
```

### fix_syntax_prompt
The drafted code contains syntax or type errors. Analyze the compiler errors and provide the updated `fixed_code`.
Return a JSON object containing the newly formatted valid TypeScript code.
Example Output:
```json
{
  "fixed_code": "export class MathUtils {\n  add(a: number, b: number): number { return a + b; }\n}"
}
```

### human_fix_prompt
The system failed to fix the syntax errors automatically after 3 attempts. Please provide a manual fix or approve the code manually.
Return a JSON object containing `human_approved_code` after manual resolving.
Example format:
```json
{
  "human_approved_code": "export class MathUtils { ... }"
}
```

### write_file_prompt
Write the final validated code to the designated file path on disk. Ensure directories exist.
Return a JSON object indicating success.
Example format:
```json
{
  "success": true
}
```

### summarize_prompt
Summarize the code generation and writing process. Detail what files were created or updated and what functions were implemented.
Return a final summary in a JSON object.
Example format:
```json
{
  "summary": "Successfully created ./src/utils/math.ts and implemented MathUtils class with basic arithmetic ops."
}
```
