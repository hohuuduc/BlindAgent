---
name: error_debugger
description: Parse Error -> Query Episodic -> [Found] Apply fix / [Not Found] Analyze -> Generate fix -> Save to Episodic -> Summarize
version: 1.0.0
nodes:
  - id: parse_error
    tool: llm
    prompt_template: parse_error_prompt
    output_schema:
      type: object
      properties:
        error_type:
          type: string
        stack_trace:
          type: string
        message:
          type: string
    edges:
      - target: query_episodic

  - id: query_episodic
    tool: memory_query
    prompt_template: query_episodic_prompt
    output_schema:
      type: object
      properties:
        found:
          type: boolean
        historical_fix:
          type: string
    edges:
      - target: apply_fix
        condition: 'found'
      - target: analyze_cause
        condition: '!found'

  - id: analyze_cause
    tool: llm
    prompt_template: analyze_cause_prompt
    output_schema:
      type: object
      properties:
        root_cause:
          type: string
        context:
          type: string
    edges:
      - target: generate_fix

  - id: generate_fix
    tool: llm
    prompt_template: generate_fix_prompt
    output_schema:
      type: object
      properties:
        unified_diff:
          type: string
    edges:
      - target: save_episodic

  - id: save_episodic
    tool: memory_save
    prompt_template: save_episodic_prompt
    output_schema:
      type: object
      properties:
        saved:
          type: boolean
    edges:
      - target: apply_fix

  - id: apply_fix
    tool: patch_applier
    prompt_template: apply_fix_prompt
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

### parse_error_prompt
Analyze the raw compilation or runtime error output. Extract the main message, error type, and relevant stack trace.
Output as a JSON object matching the schema.
Example format:
```json
{
  "error_type": "TypeError",
  "stack_trace": "at Object.<anonymous> (/src/index.ts:15:2)",
  "message": "Cannot read property 'map' of undefined"
}
```

### query_episodic_prompt
Search the episodic memory for a historically similar error message and context. Determine if a past fix exists.
Return a boolean `found` flag along with the `historical_fix` (or empty string if not found).
Example format:
```json
{
  "found": true,
  "historical_fix": "Add a null check before calling map: `data?.map(x => x)`."
}
```

### analyze_cause_prompt
The error is newly encountered. Analyze its root cause by inspecting the relevant code chunk where the stack trace originated.
Provide the `root_cause` description and immediate `context`.
Example format:
```json
{
  "root_cause": "The `data` prop was passed as undefined from the parent component instead of an array.",
  "context": "React render lifecycle, prop initially undefined."
}
```

### generate_fix_prompt
Based on the root cause analysis, generate a unified diff that applies the correct logical fix to the source code.
Ensure the format strictly uses the unified diff standard. No markdown block markers inside the string.
Example format:
```json
{
  "unified_diff": "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,3 +1,3 @@\n-return data.map(item => item.id);\n+return (data || []).map(item => item.id);"
}
```

### save_episodic_prompt
Store the newly generated fix and the corresponding error context into episodic memory for future retrieval.
Return `saved: true`.
Example format:
```json
{
  "saved": true
}
```

### apply_fix_prompt
Safely invoke the patch applier to execute either the historically retrieved fix or the newly generated diff.
Confirm it with `success: true`.
Example format:
```json
{
  "success": true
}
```

### summarize_prompt
Summarize the debugging process, whether a past fix was reused or a new one was generated, and note the resolution status.
Return a well-formatted English description in a JSON string.
Example format:
```json
{
  "summary": "Encountered TypeError, no past memory found. Generated a new unified diff for a null check and saved to episodic memory."
}
```
