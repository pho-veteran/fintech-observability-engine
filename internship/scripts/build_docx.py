from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "internship" / "de-cuong-thuc-tap.docx"

INFO = [
    ("Sinh viên thực hiện", "Nguyễn Thành Vinh"),
    ("Mã sinh viên", "23IT313"),
    ("Tên đơn vị thực tập", "Công ty Cổ phần TechX"),
    ("Chương trình", "XBrain × AWS: Accelerator Internship Program"),
    ("Lĩnh vực thực tập", "CloudOps/DevOps trên Amazon Web Services (AWS)"),
    ("Địa chỉ", "Lô A1 - Tầng 6, Tòa nhà ICT1, Công viên phần mềm số 2, Phường Hải Châu, thành phố Đà Nẵng"),
    ("Thời gian chương trình", "Từ tháng 04/2026 đến tháng 07/2026"),
    ("Giảng viên hướng dẫn", "ThS. Trần Đình Sơn"),
    ("Email", "tdson@vku.udn.vn"),
]

OBJECTIVES = [
    "Tham gia chương trình thực tập doanh nghiệp nhằm tiếp cận môi trường làm việc, quy trình triển khai và vận hành hệ thống CloudOps/DevOps trên AWS.",
    "Vận dụng kiến thức về AWS, container, Terraform, CI/CD, telemetry, observability và bảo mật để xây dựng hạ tầng cho một bài toán thực tế.",
    "Rèn luyện kỹ năng phân tích yêu cầu, thiết kế kiến trúc hạ tầng, triển khai Infrastructure as Code, kiểm thử và ghi nhận bằng chứng vận hành.",
    "Nâng cao kỹ năng làm việc nhóm, quản lý phiên bản, review thay đổi và viết tài liệu kỹ thuật trong dự án có nhiều thành phần tích hợp.",
    "Hoàn thiện một nền tảng hạ tầng có thể triển khai, kiểm thử và trình bày được cho workflow cảnh báo sớm rủi ro SLO của hệ thống fintech.",
]

PROJECT_GOALS = [
    "Xây dựng đường nhận telemetry từ ba dịch vụ tier-1: payment-gw, ledger và fraud-detector qua API Gateway POST /v1/ingest.",
    "Đóng gói và triển khai các workload container trên Amazon ECS Fargate trong private subnet, gồm Telemetry API, Prediction Worker và AI Engine.",
    "Cấu hình ADOT Collector sidecar scrape endpoint /metrics và remote_write metric vào Amazon Managed Service for Prometheus (AMP).",
    "Thiết lập EventBridge Scheduler chạy mỗi 5 phút, gửi job vào Amazon SQS để Prediction Worker truy vấn cửa sổ dữ liệu 120 phút từ AMP.",
    "Host và tích hợp AI Engine qua API Gateway AWS_IAM/SigV4, VPC Link và internal Application Load Balancer; AI Engine là workload được vận hành trong hạ tầng.",
    "Lưu audit cho mỗi prediction hoặc fallback vào DynamoDB, gửi cảnh báo qua SNS và kích hoạt static-threshold fallback khi AI không phản hồi hoặc dữ liệu không đủ.",
    "Áp dụng IAM least privilege, AWS_IAM/SigV4, KMS, Secrets Manager, Security Groups, private routing và không lưu secret trong mã nguồn.",
    "Triển khai Terraform IaC, GitHub Actions OIDC CI/CD, ECS rollback, CloudWatch alarms/dashboard và AWS Budget với Lambda cost breaker dưới ngưỡng $200/tháng.",
]

EXPECTED_RESULTS = [
    "Hạ tầng AWS được quản lý bằng Terraform, gồm networking, data, compute và observability modules; state backend và GitHub OIDC deploy role được bootstrap riêng.",
    "Telemetry API, Prediction Worker và AI Engine được host trên ECS Fargate; route công khai đi qua API Gateway có AWS_IAM/SigV4, còn giao tiếp nội bộ dùng VPC Link, ALB nội bộ và Security Groups.",
    "AMP lưu trữ metric cho bảy signal telemetry; ADOT Collector tạo đường truyền metric phù hợp với prediction bucket một phút.",
    "EventBridge Scheduler, SQS/DLQ, Prediction Worker, DynamoDB audit, SNS và static fallback tạo thành workflow có thể truy vết.",
    "GitHub Actions thực hiện validate, test, scan secret, Terraform plan/apply và deploy qua OIDC; ECS deployment circuit breaker hỗ trợ rollback khi deploy lỗi.",
    "CloudWatch dashboard, alarms, autoscaling, AWS Budget và Lambda cost breaker cung cấp khả năng quan sát và guardrail chi phí.",
    "Preflight xác nhận health 200, request ingest/predict không ký trả 403, request ký hợp lệ trả 201/200 và ECS ổn định.",
    "Bộ evidence gồm unit/contract gate, smoke, k6, AMP query response và DynamoDB audit; không mô tả live run 3 giờ là strict zero-drop k6 pass.",
    "Chi phí thiết kế always-on khoảng $158–158,33/tháng; với buffer 20% vẫn dưới $200/tháng. Hoàn thiện tài liệu kỹ thuật, báo cáo thực tập và nội dung trình bày.",
]

SCHEDULE = [
    ("1", "15/06/2026 – 21/06/2026", "Tìm hiểu đơn vị thực tập, chương trình XBrain × AWS, yêu cầu khách hàng và phạm vi observability cho ba dịch vụ tier-1.", "Nắm được bài toán, yêu cầu chức năng và phi chức năng; xác định phạm vi hạ tầng."),
    ("2", "22/06/2026 – 28/06/2026", "Phân tích luồng telemetry/prediction; thiết kế kiến trúc AWS gồm VPC, ECS Fargate, AMP, API Gateway, SQS, DynamoDB và CloudWatch.", "Sơ đồ kiến trúc, ADR và kế hoạch triển khai hạ tầng."),
    ("3", "29/06/2026 – 05/07/2026", "Bootstrap Terraform backend/OIDC; xây dựng modules networking và data cho VPC, endpoints, AMP, SQS/DLQ, DynamoDB, S3, KMS và Secrets Manager.", "Hạ tầng nền tảng được quản lý bằng Terraform."),
    ("4", "06/07/2026 – 12/07/2026", "Triển khai compute: ECR, ECS cluster, task definitions, services, ADOT sidecar, API Gateway và internal routing; kiểm tra ingest đến AMP.", "Các workload chạy trên ECS Fargate và đường telemetry hoạt động."),
    ("5", "13/07/2026 – 19/07/2026", "Thiết lập EventBridge Scheduler, SQS, Prediction Worker, AI Engine integration, DynamoDB audit, SNS alert và fallback.", "Workflow prediction được điều phối, tích hợp và có audit."),
    ("6", "20/07/2026 – 26/07/2026", "Tăng cường bảo mật: IAM/SigV4, KMS, Secrets Manager, Security Groups, private routing; cấu hình CI/CD OIDC và rollback.", "Hạ tầng được bảo mật, có pipeline triển khai và rollback."),
    ("7", "27/07/2026 – 02/08/2026", "Kiểm thử unit/contract, SigV4 smoke, k6, runtime health; cấu hình alarms, dashboard, budget và cost breaker; thu thập evidence.", "Báo cáo kiểm thử, evidence và ảnh minh chứng vận hành."),
    ("8", "03/08/2026 – 09/08/2026", "Hoàn thiện mã nguồn, Terraform, tài liệu kỹ thuật, báo cáo thực tập và nội dung trình bày.", "Sản phẩm hoàn chỉnh, báo cáo và slide trình bày."),
]


def set_cell_text(cell, text, bold=False, alignment=WD_ALIGN_PARAGRAPH.LEFT):
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    paragraph = cell.paragraphs[0]
    paragraph.alignment = alignment
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.name = "Times New Roman"
    run.font.size = Pt(11)


def add_bullets(document, values):
    for value in values:
        paragraph = document.add_paragraph(style="List Bullet")
        paragraph.paragraph_format.space_after = Pt(3)
        run = paragraph.add_run(value)
        run.font.name = "Times New Roman"
        run.font.size = Pt(12)


def main():
    document = Document()
    section = document.sections[0]
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.0)

    normal = document.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(12)

    for text, size, bold in [
        ("TRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN VÀ TRUYỀN THÔNG VIỆT - HÀN", 12, True),
        ("KHOA KHOA HỌC MÁY TÍNH", 12, True),
        ("ĐỀ CƯƠNG CHI TIẾT THỰC TẬP DOANH NGHIỆP", 16, True),
    ]:
        paragraph = document.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(6 if size == 16 else 0)
        run = paragraph.add_run(text)
        run.bold = bold
        run.font.name = "Times New Roman"
        run.font.size = Pt(size)

    table = document.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    for label, value in INFO:
        cells = table.add_row().cells
        set_cell_text(cells[0], label, bold=True)
        set_cell_text(cells[1], value, bold=label in {"Sinh viên thực hiện", "Mã sinh viên"})

    document.add_heading("1. Mục tiêu thực tập", level=1)
    add_bullets(document, OBJECTIVES)

    document.add_heading("2. Đề tài", level=1)
    paragraph = document.add_paragraph()
    run = paragraph.add_run("Xây dựng hạ tầng AWS cho nền tảng cảnh báo sớm rủi ro SLO của hệ thống fintech.")
    run.bold = True

    document.add_heading("3. Mô tả chi tiết", level=1)
    document.add_heading("3.1. Lý do chọn đề tài", level=2)
    document.add_paragraph(
        "Hệ thống fintech vận hành nhiều microservice dễ vi phạm SLO khi tài nguyên bị cạn kiệt dần, "
        "nhưng dashboard và ngưỡng tĩnh không đủ tạo ra quy trình cảnh báo sớm có bằng chứng, khuyến nghị và truy vết quyết định."
    )
    document.add_paragraph(
        "Đề tài áp dụng kiến thức CloudOps/DevOps để xây dựng hạ tầng AWS cho luồng telemetry và prediction: "
        "tiếp nhận telemetry, lưu metric time-series, host và tích hợp AI Engine, điều phối prediction, lưu audit, gửi cảnh báo và duy trì fallback. "
        "Phạm vi không bao gồm phát triển, huấn luyện hoặc tối ưu mô hình AI."
    )

    document.add_heading("3.2. Mục tiêu dự án", level=2)
    add_bullets(document, PROJECT_GOALS)

    document.add_heading("3.3. Kết quả dự kiến", level=2)
    add_bullets(document, EXPECTED_RESULTS)

    document.add_heading("4. Kế hoạch thực hiện", level=1)
    schedule = document.add_table(rows=1, cols=4)
    schedule.style = "Table Grid"
    for cell, text in zip(schedule.rows[0].cells, ("Tuần", "Thời gian", "Nội dung thực hiện", "Kết quả dự kiến")):
        set_cell_text(cell, text, bold=True, alignment=WD_ALIGN_PARAGRAPH.CENTER)
    for row in SCHEDULE:
        cells = schedule.add_row().cells
        for cell, text in zip(cells, row):
            set_cell_text(cell, text, alignment=WD_ALIGN_PARAGRAPH.CENTER if text == row[0] else WD_ALIGN_PARAGRAPH.LEFT)

    document.add_paragraph()
    signatures = document.add_table(rows=3, cols=2)
    signatures.style = "Table Grid"
    for index, text in enumerate(("SINH VIÊN THỰC HIỆN", "GIẢNG VIÊN HƯỚNG DẪN")):
        set_cell_text(signatures.rows[0].cells[index], text, bold=True, alignment=WD_ALIGN_PARAGRAPH.CENTER)
        set_cell_text(signatures.rows[1].cells[index], "(Ký và ghi rõ họ tên)", alignment=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_text(signatures.rows[2].cells[0], "Nguyễn Thành Vinh", bold=True, alignment=WD_ALIGN_PARAGRAPH.CENTER)
    set_cell_text(signatures.rows[2].cells[1], "ThS. Trần Đình Sơn", bold=True, alignment=WD_ALIGN_PARAGRAPH.CENTER)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
