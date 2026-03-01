# Plan 1: JSON Sanitizer Module

> **Độc lập hoàn toàn** — không phụ thuộc engine, LLM, hay bất kỳ module nào khác.

## Mục tiêu
Xây dựng `core/json-sanitizer.ts` — pipeline xử lý raw LLM output thành valid JSON.

## Dependencies (npm)
- `jsonrepair` — tự động sửa lỗi JSON phổ biến

## File cần tạo

### [NEW] `src/core/json-sanitizer.ts`
```typescript
// Exports:
export function sanitizeLLMJson(raw: string): string;
```

**Pipeline:**
1. `stripMarkdownCodeBlock()` — Regex bỏ ` ```json ... ``` `
2. `extractJsonObject()` — Regex tìm `{ }` hoặc `[ ]` ngoài cùng
3. `jsonrepair()` — sửa thiếu comma, ngoặc kép, trailing comma, single quotes
4. Return cleaned string (chưa parse, để caller tự JSON.parse + zod)

### [NEW] `tests/json-sanitizer.test.ts`
Test cases:
1. JSON thuần — pass through
2. JSON bọc trong ` ```json ... ``` `
3. JSON kèm text trước: `"Here is the JSON: {...}"`
4. JSON kèm text sau: `{...} Hope this helps!`
5. Trailing commas: `{"a": 1, "b": 2,}`
6. Single quotes: `{'a': 'value'}`
7. Thiếu closing bracket: `{"a": 1`
8. Thiếu comma giữa properties: `{"a": 1 "b": 2}`
9. Nested objects bọc markdown
10. Array output: `[{...}, {...}]`
11. Empty/whitespace input → throw
12. Hoàn toàn không phải JSON → throw

## Verification
```bash
npx vitest run tests/json-sanitizer.test.ts
```
