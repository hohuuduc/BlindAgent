# Kịch bản Trung bình: Sửa đổi mã nguồn (Feature Addition)

## 🎯 Mục tiêu
Kiểm thử chuỗi hành động kết hợp các Tool: Tìm file, Đọc code, Ghi/Modify code, và đặc biệt là Syntax-Check (việc kiểm tra lỗi cú pháp sau khi ghi). Kịch bản này đòi hỏi `plan-agent` rớt ra ít nhất 2 bước (Task).

## 📝 Prompt đầu vào

```text
Tôi muốn tối ưu hoá hàm countTokens trong src/utils/token-counter.ts. Hãy sửa hàm này thành cơ chế có cache (dùng một Map tĩnh ngoài scope của hàm) để nếu chuỗi text đã được đếm rồi thì trả kết quả ngay lập tức thay vì gọi lại gpt-tokenizer. Hãy thực hiện việc này.
```

## 🔍 Log theo dõi (Kỳ vọng)

1. **Planning:**
   - Ít nhất 2 tasks. Task 1: Dùng `code_explorer` hoặc `code_modifier` đọc file `src/utils/token-counter.ts`.
   - Task 2: Dùng `code_modifier` / `code_writer` để thay thế đoạn mã. Cần có dependency đúng (Task 2 đợi Task 1).
2. **Execution:**
   - Tool `read_file` lấy nội dung `token-counter.ts`.
   - Tool `write_file` hoặc `multi_replace_file_content` (tuỳ logic ToolRegistry của bạn) tiến hành cập nhật code.
   - Framework phải tự động chạy qua node "Syntax Check" (nếu bạn định nghĩa trong skill `code_modifier`). Tool `syntax-check` sẽ dùng `ts-morph` phân tích lại file.
   - Nếu có lỗi thiếu dấu hay syntax sai do Model (chẳng hạn quên `import Map`), hệ thống sẽ kích hoạt Episodic Memory hoặc nốt tự sửa để fix lại.

## ✅ Tiêu chí nghiệm thu
- File `src/utils/token-counter.ts` bị thay đổi với nội dung là một instance biến `Map<string, number>` khai báo ở mức module.
- Build Typescript (`npx tsc`) sau đó không báo lỗi, chứng tỏ Syntax Check hoạt động.
- Framework không thoát quá trình giữa chừng (crash).
