# Plan 4: Skill Definition Files (Markdown)

> **Độc lập hoàn toàn** — chỉ viết markdown, không cần code. Có thể viết trước khi có engine, loader sẽ parse sau.

## Mục tiêu
Viết 4 file skill `.md` theo Declarative Skill format đã định nghĩa trong plan chính (mục 4).

## Files cần tạo

### [NEW] `skills/code_explorer.md`
- **Flow:** Scan Directory → AST Extract → Summarize → Save to Semantic Memory
- **Nodes:** `scan_dir` (tool) → `extract_ast` (tool) → `summarize` (llm)
- Viết đầy đủ YAML frontmatter (nodes, edges, output_schema) + prompt templates

### [NEW] `skills/code_writer.md`
- **Flow:** Analyze Spec → Draft Code → Validate Syntax → [Fix Loop max 3] → 🧑 Human Fix → Write File → Summarize
- **Nodes:** `analyze_spec` (llm) → `draft_code` (llm) → `validate_syntax` (tool) → `fix_syntax` (llm, max 3) → `human_fix` (human_input) → `write_file` (tool) → `summarize` (llm)
- Bao gồm HITL node cho fallback

### [NEW] `skills/code_modifier.md`
- **Flow:** Read File → AST Chunk → Generate Diff → Validate Diff → Apply → Summarize
- **Nodes:** `read_file` (tool) → `chunk_ast` (tool) → `generate_diff` (llm) → `validate_diff` (tool) → `apply_diff` (tool) → `summarize` (llm)
- Prompt template phải ép LLM output unified diff format

### [NEW] `skills/error_debugger.md`
- **Flow:** Parse Error → Query Episodic → [Found] Apply fix / [Not Found] Analyze → Generate fix → Save to Episodic
- **Nodes:** `parse_error` (llm) → `query_episodic` (tool) → branching → `analyze_cause` (llm) → `generate_fix` (llm) → `save_episodic` (tool) → `summarize` (llm)

## Quy tắc viết Skill
- YAML frontmatter: `name`, `description`, `version`, `nodes[]` (id, tool, prompt_template, output_schema, edges[])
- Body markdown: `## Prompt Templates` → mỗi heading `### <template_name>` chứa prompt
- System prompt per node < 300 tokens
- Mỗi prompt đều ép output JSON, kèm ví dụ inline

## Verification
- Validate thủ công: YAML parseable, tất cả edge targets tồn tại, không dead-end
- Khi có `skills/loader.ts` → chạy loader parse → verify SkillGraph output
