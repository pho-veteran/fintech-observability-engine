<div align="center">

**TRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN**
**VÀ TRUYỀN THÔNG VIỆT - HÀN**
**KHOA KHOA HỌC MÁY TÍNH**

# ĐỀ CƯƠNG CHI TIẾT THỰC TẬP

</div>

**SV thực hiện:** Nguyễn Thành Vinh
**Mã SV:** 23IT313
**Tên đơn vị thực tập:** Công ty Cổ phần TechX
**Lĩnh vực thực tập:** CloudOps/DevOps
**Địa chỉ:** Lô A1 - Tầng 6, Tòa nhà ICT1, Công viên phần mềm số 2, Phường Hải Châu, thành phố Đà Nẵng
**Người hướng dẫn:** [[CHƯA ĐIỀN: Họ tên người hướng dẫn tại doanh nghiệp]]
**GVHD:** ThS. Trần Đình Sơn
**Email:** tdson@vku.udn.vn

## 1. Đề tài

**Xây dựng hạ tầng AWS cho nền tảng cảnh báo sớm rủi ro SLO của hệ thống fintech**

## 2. Nội dung thực tập

Trong thời gian thực tập, sinh viên tìm hiểu và tham gia xây dựng hạ tầng AWS phục vụ nền tảng thu thập dữ liệu vận hành, phân tích nguy cơ vi phạm SLO và gửi cảnh báo sớm cho các dịch vụ fintech trọng yếu. Công việc tập trung vào CloudOps/DevOps, gồm thiết kế kiến trúc, triển khai hạ tầng, bảo mật, tự động hóa và giám sát vận hành. AI Engine được triển khai và tích hợp như một dịch vụ chạy trên hạ tầng; phạm vi thực tập không bao gồm phát triển, huấn luyện hoặc tối ưu mô hình AI.

### a. Tìm hiểu công nghệ được sử dụng trong dự án

**Hạ tầng đám mây và container:**

- Tìm hiểu các thành phần mạng trên AWS như VPC, subnet công khai và riêng tư, bảng định tuyến, NAT Gateway, VPC Endpoint và Security Group.
- Tìm hiểu Amazon ECS Fargate để triển khai các dịch vụ dưới dạng container mà không phải quản lý máy chủ; sử dụng Amazon ECR để lưu trữ và quản lý container image.
- Tìm hiểu API Gateway, VPC Link và Application Load Balancer để tiếp nhận yêu cầu từ bên ngoài và định tuyến an toàn đến các dịch vụ trong mạng nội bộ.
- Nghiên cứu cơ chế tự động điều chỉnh tài nguyên, kiểm tra trạng thái dịch vụ và khôi phục phiên bản khi triển khai gặp lỗi.

**Hạ tầng dưới dạng mã và tự động hóa triển khai:**

- Tìm hiểu Terraform và cách mô tả, quản lý, kiểm soát phiên bản hạ tầng AWS bằng Infrastructure as Code.
- Tổ chức hạ tầng theo các nhóm chức năng gồm mạng, dữ liệu, xử lý và giám sát để thuận tiện triển khai, kiểm tra và bảo trì.
- Tìm hiểu quy trình CI/CD bằng GitHub Actions, sử dụng cơ chế xác thực OIDC để cấp quyền tạm thời khi triển khai lên AWS.
- Thực hiện các bước kiểm tra cấu hình, kiểm thử, rà soát thông tin nhạy cảm, lập kế hoạch thay đổi và triển khai tự động.

**Thu thập dữ liệu và giám sát hệ thống:**

- Tìm hiểu SLO, các chỉ số vận hành và vai trò của khả năng quan sát trong việc phát hiện sớm nguy cơ ảnh hưởng đến dịch vụ fintech.
- Tìm hiểu AWS Distro for OpenTelemetry để thu thập dữ liệu đo lường từ các dịch vụ và gửi đến Amazon Managed Service for Prometheus.
- Sử dụng Amazon CloudWatch để xây dựng bảng theo dõi, cảnh báo và kiểm tra trạng thái của các dịch vụ, hàng đợi và tài nguyên hạ tầng.
- Theo dõi các nhóm tín hiệu như mức sử dụng CPU, bộ nhớ, số kết nối, độ bão hòa kết nối cơ sở dữ liệu, độ sâu hàng đợi, tỷ lệ truy cập bộ nhớ đệm và độ trễ API.

**Điều phối quy trình dự đoán và cảnh báo:**

- Tìm hiểu EventBridge Scheduler để khởi tạo tác vụ theo chu kỳ và Amazon SQS để tách rời các thành phần xử lý.
- Tìm hiểu cách dịch vụ xử lý truy vấn dữ liệu đo lường, gọi AI Engine và lưu kết quả dự đoán vào DynamoDB để phục vụ việc theo dõi và đối chiếu.
- Tìm hiểu Dead Letter Queue để lưu các tác vụ xử lý thất bại và Amazon SNS để gửi cảnh báo vận hành.
- Xây dựng cơ chế dự phòng dựa trên ngưỡng tĩnh khi dữ liệu chưa đủ hoặc AI Engine tạm thời không sẵn sàng.

**Bảo mật và kiểm soát chi phí:**

- Tìm hiểu IAM và nguyên tắc đặc quyền tối thiểu; sử dụng AWS IAM Signature Version 4 để xác thực các yêu cầu nghiệp vụ.
- Tìm hiểu KMS, Secrets Manager và Systems Manager Parameter Store để mã hóa, lưu trữ và cấp phát thông tin cấu hình nhạy cảm.
- Hạn chế truy cập trực tiếp từ Internet bằng mạng riêng, quy tắc tường lửa và phân tách luồng giao tiếp giữa các thành phần.
- Thiết lập AWS Budget và cơ chế kiểm soát chi phí để theo dõi mức sử dụng ngân sách trong môi trường thực tập.

### b. Tìm hiểu cách sử dụng GitHub trong doanh nghiệp

- Thực hành quản lý mã nguồn bằng commit, push, pull, branch, merge và pull request.
- Tìm hiểu quy trình làm việc theo nhánh, kiểm tra thay đổi trước khi hợp nhất và phối hợp xử lý xung đột mã nguồn.
- Lưu trữ cấu hình hạ tầng trên Git để theo dõi lịch sử thay đổi và hỗ trợ khôi phục khi cần thiết.
- Tích hợp GitHub Actions để tự động hóa các bước kiểm tra, xây dựng và triển khai.
- Tuân thủ quy tắc bảo vệ thông tin nhạy cảm, không đưa khóa truy cập hoặc mật khẩu vào kho mã nguồn.

### c. Tìm hiểu các kỹ năng cần có trong công việc

- Kỹ năng làm việc nhóm và phối hợp với các thành viên phụ trách phát triển, kiểm thử và vận hành hệ thống.
- Kỹ năng giao tiếp, trao đổi yêu cầu, báo cáo tiến độ và trình bày vấn đề kỹ thuật rõ ràng.
- Kỹ năng quản lý thời gian, phân chia công việc theo tuần và hoàn thành nhiệm vụ đúng thời hạn.
- Tư duy phân tích, xử lý sự cố và đánh giá ảnh hưởng của thay đổi trước khi triển khai.
- Kỹ năng đọc tài liệu kỹ thuật, tự học công nghệ mới và ghi chép kết quả thực hiện.

## 3. Kế hoạch công việc thực tập

| Tuần | Thời gian | Nội dung thực hiện | Kết quả dự kiến |
|---:|---|---|---|
| 1 | 15/06 - 21/06/2026 | Tìm hiểu đơn vị thực tập, yêu cầu của đề tài và phạm vi giám sát đối với ba dịch vụ fintech trọng yếu. | Mô tả bài toán, yêu cầu và phạm vi hạ tầng cần xây dựng. |
| 2 | 22/06 - 28/06/2026 | Phân tích luồng thu thập dữ liệu và dự đoán; thiết kế kiến trúc triển khai trên AWS. | Sơ đồ kiến trúc và kế hoạch triển khai hạ tầng. |
| 3 | 29/06 - 05/07/2026 | Khởi tạo hạ tầng bằng Terraform; xây dựng mạng, kho dữ liệu, hàng đợi, mã hóa và quản lý thông tin nhạy cảm. | Hoàn thành các thành phần hạ tầng nền tảng. |
| 4 | 06/07 - 12/07/2026 | Triển khai các dịch vụ container trên ECS Fargate; cấu hình cổng API, định tuyến nội bộ và luồng thu thập dữ liệu đo lường. | Các dịch vụ hoạt động trên AWS và dữ liệu được chuyển đến hệ thống giám sát. |
| 5 | 13/07 - 19/07/2026 | Thiết lập tác vụ định kỳ, hàng đợi xử lý, tích hợp AI Engine, lưu vết kết quả, cảnh báo và cơ chế dự phòng. | Quy trình dự đoán và cảnh báo hoạt động theo thiết kế. |
| 6 | 20/07 - 26/07/2026 | Hoàn thiện phân quyền, xác thực, mã hóa và bảo vệ mạng; xây dựng quy trình CI/CD và cơ chế khôi phục khi triển khai lỗi. | Hạ tầng đáp ứng các yêu cầu cơ bản về bảo mật và tự động hóa triển khai. |
| 7 | 27/07 - 02/08/2026 | Kiểm thử các luồng chính, kiểm tra tải và trạng thái vận hành; cấu hình bảng theo dõi, cảnh báo và kiểm soát chi phí. | Báo cáo kiểm thử, số liệu đánh giá và hình ảnh minh chứng. |
| 8 | 03/08 - 09/08/2026 | Hoàn thiện sản phẩm, tài liệu kỹ thuật, báo cáo thực tập và nội dung trình bày. | Sản phẩm hoàn chỉnh, báo cáo thực tập và slide trình bày. |

<br>

| **SINH VIÊN THỰC HIỆN** | **GIẢNG VIÊN HƯỚNG DẪN** |
|---|---|
| *(Ký và ghi rõ họ tên)* | *(Ký và ghi rõ họ tên)* |
| **Nguyễn Thành Vinh** | **ThS. Trần Đình Sơn** |
