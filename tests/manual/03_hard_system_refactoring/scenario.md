# Kịch bản Khó: Tái cấu trúc hệ thống (System Refactoring)

## 🎯 Mục tiêu
Đánh giá khả năng của mô hình LLM nhỏ trong việc hiểu bức tranh tổng thể của hệ thống bộ nhớ. Module `working.ts` hiện tại có 3 lifecycles (`persistent`, `ephemeral`, `carry-over`). Thử thách là yêu cầu LLM phân tích, sửa file interface `types.ts` và logic lõi trong `working.ts` để thêm 1 vòng đời thứ 4.

## 📝 Prompt đầu vào
```text
Hệ thống WorkingMemory hiện tại hỗ trợ các lifecycle: 'persistent', 'ephemeral', và 'carry-over'.
Hãy thêm một lifecycle mới gọi là 'session'. Slots mang type 'session' sẽ không bị xoá khi gọi "advanceNode()" nhưng sẽ bị xoá khi gọi hàm "clearSession()". 
Bạn cần tìm và đọc file types.ts cũng như working.ts để hiểu cấu trúc trước. Sau đó:
1. Sửa SlotLifecycle type trong src/core/types.ts.
2. Sửa WorkingMemory trong src/memory/working.ts (bổ sung clearSession() và tránh xoá session trong advanceNode()).
Hãy đảm bảo code không bị lỗi cú pháp.
```

## 🔍 Log theo dõi (Kỳ vọng)

1. **Planning:**
   - Hệ thống (Plan Agent) sẽ đưa ra quy trình từ 2-4 Tasks:
     - Task 1: Dùng `code_explorer` tìm file chứa `WorkingMemory` và các `type` liên quan.
     - Task 2: Dùng `code_modifier` sửa `src/core/types.ts` thêm `'session'` vào Union Type.
     - Task 3: Dùng `code_modifier` sửa `src/memory/working.ts` thêm hàm `clearSession` và cập nhật hàm `advanceNode` (hoặc `toJSON`/`fromJSON`).
2. **Execution:**
   - Việc sửa đổi file `src/core/types.ts` là rất nhạy cảm vì nhiều module phụ thuộc. Framework sẽ chạy tool cập nhật code.
   - Nếu LLM quên cập nhật `import` hoặc xảy ra lỗi ở file khác, syntax checker sẽ catch và buộc Node phải lặp lại qua tính năng Retries của `executeSkillGraph`.
   - Tool `terminal` có thể sẽ được gọi ngầm trong quá trình debug (qua hàm sửa đổi `code_modifier`).
   - Sẽ xuất hiện Context Window limits và hệ thống sẽ tự động chuyển `ast-parser` từ Level 1 xuống Level 2/3 để vượt qua.

## ✅ Tiêu chí nghiệm thu
- File `src/core/types.ts` chứa: `export type SlotLifecycle = 'persistent' | 'ephemeral' | 'carry-over' | 'session';`
- File `src/memory/working.ts` có public method `clearSession()` tự động xoá mọi slot có `lifecycle === 'session'`.
- Chạy `npm run build` không ra báo lỗi type.
- Cấu trúc thư mục được bảo toàn trọn vẹn. Ngăn chặn triệt để "Ảo giác hệ thống" (viết code nằm rải rác sai file).
