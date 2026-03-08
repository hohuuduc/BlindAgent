# Kịch bản Dễ: Đọc hiểu và phân tích mã (Code Exploration)

## 🎯 Mục tiêu
Đánh giá khả năng của `plan-agent` trong việc chọn skill `code_explorer` và khả năng của model đọc mã nguồn, sau đó tóm tắt lại chính xác logic hoạt động của file. Kịch bản này kiểm tra Memory, Token Chunking (ast-parser) khi file dài, và khả năng tóm tắt của Prompt Renderer.

## 📝 Prompt đầu vào
Bạn hãy copy và dán chính xác dòng lệnh sau vào giao diện dòng lệnh (sau khi chạy `npm run dev`):

```text
Hãy phân tích file src/core/llm-provider.ts và giải thích chi tiết cách hệ thống xử lý lỗi định dạng JSON từ model bằng cơ chế retry. Chỉ ra hàm nào chịu trách nhiệm cho việc này.
```

## 🔍 Log theo dõi (Kỳ vọng)
1. **Planning:** Hệ thống sẽ sinh ra 1 Task.
   - `id`: `task_1`
   - `skill_id`: `code_explorer` (hoặc tên tương tự tuỳ bạn đặt trong meta của file markdown).
2. **Execution:** `TaskAgent` bắt đầu chạy.
   - Node 1 tải skill `code_explorer` và gọi tool `read_file` (hoặc `search_files` + `read_file` tuỳ hướng giải quyết của LLM) để đọc file `src/core/llm-provider.ts`.
   - Node LLM lấy nội dung code và trả về phần tóm lược.
3. **Thành phẩm:** Hệ thống in ra `TaskResult` kèm theo nội dung giải thích rõ ràng cơ quan: 
   - `structuredOutput` hàm bắt lỗi JSON.
   - Hàm `sanitizeLLMJson` được gọi trước.
   - `try-catch` chặn lỗi và đẩy một system prompt ép RAW JSON cho lần gọi thứ 2.

## ✅ Tiêu chí nghiệm thu
- Không bị văng lỗi vượt giới hạn (Context Budget Overflow).
- Hệ thống trả lời bằng tiếng Việt (theo luật số 3) và đúng chi tiết kỹ thuật có trong file `llm-provider.ts`.
- Memory hiển thị việc ghi dữ liệu (OutputManager ghi chú file Affected/Summary).
