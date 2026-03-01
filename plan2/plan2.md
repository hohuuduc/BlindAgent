# Plan 2: AST Parser & Code Chunking Module

> **Độc lập hoàn toàn** — chỉ cần `ts-morph` và `gpt-tokenizer`, không phụ thuộc engine hay LLM.

## Mục tiêu
Xây dựng `tools/ast-parser.ts` — đọc file TS/JS, extract AST chunks theo 3 cấp độ, render dạng annotated code.

## Dependencies (npm)
- `ts-morph` — TypeScript Compiler API wrapper
- `gpt-tokenizer` hoặc `tiktoken` — đếm tokens

## Files cần tạo

### [NEW] `src/tools/ast-parser.ts`
```typescript
// Exports:
export function chunkForContext(filePath: string, target: string, budget: number): ChunkResult;
export function renderAnnotatedCode(filePath: string, code: string, startLine: number): string;
export function extractFunctions(filePath: string): FunctionInfo[];
export function extractImports(filePath: string): ImportInfo[];
```

**3-Level Chunking:**
- **L1:** Extract target function/class nguyên vẹn + imports + type info (via `ts-morph`)
- **L2:** Chia function body thành blocks (try/catch, if/else, loop), giữ block liên quan nhất
- **L3:** Chỉ giữ signature + JSDoc + line range markers

**Annotated Code Format:**
```
--- src/auth.ts:15-25 ---
  15 | export async function login(...): Promise<Token> {
  16 |   const user = await db.findUser(email);
  ...
---
```

### [NEW] `src/utils/token-counter.ts`
```typescript
export function countTokens(text: string): number;
export function trimToTokenBudget(text: string, budget: number): string;
```

### [NEW] `tests/ast-parser.test.ts`
Test cases:
1. Extract single function từ file nhỏ → level 1
2. Extract class method → level 1 kèm type info
3. Function > budget → fallback level 2 (block split)
4. Monolith function 500+ lines → fallback level 3 (signature only)
5. `renderAnnotatedCode()` → verify line number format
6. `extractFunctions()` → list tất cả functions + signatures
7. File không tồn tại → throw
8. File không phải TS/JS → graceful error

### [NEW] `tests/fixtures/sample-code.ts`
File test 200+ dòng với nhiều functions, classes, types — dùng cho test.

## Verification
```bash
npx vitest run tests/ast-parser.test.ts
```
