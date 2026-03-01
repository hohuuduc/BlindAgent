# Task 3: Memory System

- [x] Cài `better-sqlite3`, `@types/better-sqlite3`, `vectra`
- [x] Đảm bảo `src/core/types.ts` có interfaces: `StateSlots`, `Checkpoint`, `TaskSummary`, `ErrorEntry`
- [x] Tạo `src/memory/working.ts` — StateSlots manager với 3 lifecycle types
- [x] Tạo `src/memory/checkpoint.ts` — SQLite WAL checkpoint save/load/delete
- [x] Tạo `src/memory/semantic.ts` — vectra wrapper (add, search)
- [x] Tạo `src/memory/episodic.ts` — SQLite error pattern store
- [x] Tạo `src/memory/task-output.ts` — JSON file inter-task output
- [x] Tạo `tests/memory.test.ts` — test cho từng module
- [x] Chạy tests pass hết
