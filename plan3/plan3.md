# Plan 3: Memory System

> **Gần như độc lập** — chỉ phụ thuộc `core/types.ts` (shared interfaces). Có thể phát triển song song với engine nếu types được định nghĩa trước.

## Mục tiêu
Xây dựng 4 memory modules + SQLite schema + Vector DB integration.

## Dependencies (npm)
- `better-sqlite3` + `@types/better-sqlite3` — SQLite cho checkpoint + episodic
- `vectra` — local vector DB cho semantic memory

## Prerequisite
- `src/core/types.ts` phải có trước (chỉ cần interface `StateSlots`, `Checkpoint`, `TaskSummary`)

## Files cần tạo

### [NEW] `src/memory/working.ts` — StateSlots Manager
```typescript
export class WorkingMemory {
  // Quản lý 3 loại slots: persistent, carry-over, ephemeral
  set(slot: string, value: any, lifecycle: SlotLifecycle): void;
  get(slot: string): any;
  advanceNode(): void;       // Shift carry-over, xóa ephemeral
  toJSON(): Record<string, any>;
  static fromJSON(data: Record<string, any>): WorkingMemory;
}
```

### [NEW] `src/memory/checkpoint.ts` — Crash Recovery
```typescript
export class CheckpointManager {
  constructor(dbPath: string);  // Mở SQLite, tạo table, bật WAL
  save(checkpoint: Checkpoint): void;
  load(taskId: string): Checkpoint | null;
  loadIncomplete(): Checkpoint | null;  // Tìm checkpoint chưa xong
  delete(taskId: string): void;
}
```
SQLite schema:
```sql
CREATE TABLE checkpoints (
  task_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,  -- JSON serialized Checkpoint
  created_at INTEGER NOT NULL
);
```

### [NEW] `src/memory/semantic.ts` — Vector DB Wrapper
```typescript
export class SemanticMemory {
  constructor(indexPath: string);
  add(text: string, metadata: any): Promise<void>;
  search(query: string, topK: number): Promise<SearchResult[]>;
  // Note: `embed()` sẽ được inject từ LLMProvider khi wire-up
}
```

### [NEW] `src/memory/episodic.ts` — Error Pattern Store
```typescript
export class EpisodicMemory {
  constructor(dbPath: string);
  saveError(error: ErrorEntry): void;
  findSimilar(errorType: string, file: string): ErrorEntry | null;
  getRecentErrors(limit: number): ErrorEntry[];
}
```

### [NEW] `src/memory/task-output.ts` — Inter-task Output
```typescript
export class TaskOutputManager {
  constructor(dataDir: string);
  save(taskId: string, output: TaskSummary): void;
  load(taskId: string): TaskSummary | null;
  loadPrevious(currentTaskId: string): TaskSummary | null;
}
```

### [NEW] `tests/memory.test.ts`
Test cases cho mỗi module:
- WorkingMemory: slot lifecycle (set → advance → verify xóa/giữ)
- Checkpoint: save → load → verify, delete after success
- Episodic: saveError → findSimilar match → verify fix returned
- TaskOutput: save → loadPrevious → verify chaining

## Verification
```bash
npx vitest run tests/memory.test.ts
```
