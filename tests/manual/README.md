# Hướng dẫn Kiểm thử Thủ công (Manual Testing Scenarios)

Thư mục này chứa các kịch bản kiểm thử thực tế được phân loại theo độ phức tạp từ Dễ đến Khó. Các kịch bản này được thiết kế để bạn chạy trực tiếp thông qua giao diện CLI của hệ thống (`npm run dev`) với các model như `gpt-oss:20b`.

Mục tiêu là đánh giá toàn diện khả năng của hệ thống trong môi trường tương tác thực tế: từ khả năng chia task (Planning), tìm kiếm file, hiểu logic, cho đến khả năng tự động sửa code và phục hồi lỗi (Error Debugging).

## Danh sách Kịch bản

| Mức độ | Thư mục | Trọng tâm đánh giá |
|--------|---------|---------------------|
| 🟢 Dễ | `01_easy_code_exploration` | Khả năng đọc mã nguồn, sử dụng công cụ tìm kiếm cơ bản, và giải thích tóm tắt logic của LLM. |
| 🟡 Trung bình | `02_medium_feature_addition` | Khả năng đọc hiểu đa module, viết code bổ sung tính năng mới và pass qua bước `syntax-check`. |
| 🔴 Khó | `03_hard_system_refactoring` | Lên kế hoạch phức tạp nhiều bước, sửa đổi ở tầng Core/Types (ảnh hưởng diện rộng), khả năng ghi nhớ Task Output và sửa lỗi nếu gây hỏng logic. |

## Cấu trúc một kịch bản
Mỗi thư mục chứa một file `scenario.md` bao gồm:
1. **Mục tiêu**: Điều hệ thống cần đạt được.
2. **Prompt đầu vào**: Câu lệnh bạn sẽ copy dán vào CLI.
3. **Log theo dõi (Trạng thái kỳ vọng)**: Cách hệ thống lên plan (`Plan Agent`), các skill được chọn, quá trình chạy Tool trong console.
4. **Tiêu chí nghiệm thu (Acceptance Criteria)**: Cách bạn kiểm chứng model có làm đúng hay không.

## Cách chạy
Khởi động hệ thống:
```bash
npm run dev
```
Sau đó dán "Prompt đầu vào" của từng kịch bản và theo dõi.
