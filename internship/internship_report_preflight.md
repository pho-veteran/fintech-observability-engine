# Preflight báo cáo thực tập — TF4 Foresight Lens

> Mục đích: nguồn chuẩn bị báo cáo, không phải báo cáo cuối cùng. File `Đề cương chi tiết Thực tập.doc` bên ngoài repo chỉ là mẫu định dạng; nội dung báo cáo phải phản ánh phần việc hạ tầng của dự án này: nền tảng AWS ECS Fargate host và tích hợp dịch vụ AI để cảnh báo sớm SLO cho fintech.

## 1. Đề tài và phạm vi đề xuất

**Tên đề tài:** Xây dựng hạ tầng AWS cho nền tảng cảnh báo sớm rủi ro SLO của hệ thống fintech.

**Phạm vi hạ tầng đã thực hiện:**

- Cung cấp đường ingest telemetry cho `payment-gw`, `ledger`, `fraud-detector`; kiểm soát API Gateway AWS_IAM/SigV4, label policy và đường truyền ADOT → AMP.
- Triển khai, host và vận hành container `ai-engine` trên ECS Fargate; trách nhiệm hạ tầng là khả dụng, định tuyến, bảo mật, autoscaling và quan sát dịch vụ, **không phải phát triển mô hình/thuật toán AI**.
- Orchestrate prediction window 120 phút theo chu kỳ 5 phút qua EventBridge Scheduler, SQS và Prediction Worker; lưu decision audit vào DynamoDB, gửi SNS alert và thực thi fallback khi AI không phản hồi.
- Cung cấp Terraform IaC cho network, data, compute, observability; CI/CD GitHub Actions OIDC, ECS rollback và guardrail chi phí `$200/tháng`.
- Không auto-remediation, không multi-region và không xây dashboard mới như sản phẩm chính.

Nguồn phạm vi: requirements analysis, infrastructure design, and deployment design documents.

## 2. Dàn ý báo cáo và nguồn bằng chứng

| Chương báo cáo | Nội dung cần viết | Nguồn repo |
|---|---|---|
| Mở đầu | Bối cảnh fintech miss SLO do capacity exhaustion; nhu cầu có workflow hạ tầng nhận telemetry, host AI và tạo evidence cho SRE. | Tài liệu phân tích yêu cầu, §1 và §3. |
| Mục tiêu và yêu cầu | Hạ tầng cho ba service, 7 signals, telemetry 1 phút, prediction 5 phút, lookback 120 phút, lead time ≥15 phút, budget ≤$200/tháng. | Tài liệu phân tích yêu cầu, §2. |
| Phân tích và thiết kế hạ tầng | VPC/private routing, API Gateway, ECS/ADOT/AMP, Scheduler/SQS, DynamoDB/SNS; lý do chọn ECS/AMP/DynamoDB. | Tài liệu thiết kế hạ tầng và các quyết định kiến trúc. |
| Hiện thực hạ tầng | Terraform modules, ECR image lifecycle, ECS task/service/autoscaling, Service Connect/API Gateway integration, dashboard và cost-breaker Lambda. AI Engine được host như workload tích hợp, không trình bày thuật toán AI. | Tài liệu hạ tầng và thiết kế triển khai. |
| Bảo mật, triển khai, chi phí | SigV4/AWS_IAM, least-privilege IAM, KMS/Secrets Manager, private routing, GitHub OIDC, ECS rollback, Budget/cost breaker. | Tài liệu thiết kế bảo mật, triển khai và phân tích chi phí. |
| Kiểm thử và đánh giá | IaC/unit gate, SigV4 smoke, k6, ECS/SQS/AMP runtime state và DynamoDB audit evidence. | Kế hoạch kiểm thử, báo cáo đánh giá và evidence pack. |
| Kết quả, hạn chế, hướng phát triển | Kết quả live run; fallback và reliability boundaries; không auto-remediation/multi-region; hướng mở rộng hạ tầng. | Báo cáo đánh giá và phần giới hạn phạm vi trong tài liệu yêu cầu. |
| Đóng góp cá nhân | Chỉ mô tả phần hạ tầng có thể đối chiếu với commit, issue, PR hoặc mentor xác nhận. Không nhận phần xây dựng mô hình AI nếu không trực tiếp thực hiện. | Điền sau khi đối chiếu lịch sử Git và xác nhận mentor. |

### Profile demo AWS dùng một giờ

Khi cần tái triển khai để chụp bằng chứng mới, sử dụng profile disposable đã chuẩn bị cho môi trường lab: lookback 30 phút, AI Engine một task, ACM tắt và cho phép dọn dữ liệu S3/ECR khi teardown. Đây là profile demo rút gọn; contract thiết kế/production và các bằng chứng lịch sử ở trên vẫn là lookback 120 phút.

Luồng triển khai local dùng AWS CLI `default` profile, partial S3 backend và targeted ECR apply trước khi push image. CI/OIDC dùng repository variables cho account, region và state bucket; OIDC không phải điều kiện bắt buộc để chạy lab local.

Bằng chứng của phiên lab phải được lưu trong thư mục run riêng và ghi rõ **30-minute lab window**. Không dùng nó để tuyên bố vừa kiểm thử lại window 120 phút hoặc thay thế curated historical evidence.

## 3. Fact sheet được phép trích dẫn

| Claim | Evidence |
|---|---|
| Hạ tầng API Gateway bảo vệ ingress: health 200, request không ký bị 403, request ký ingest/predict đạt 201/200. | Preflight result trong evidence pack. |
| Unit/contract gate gần nhất: `180 passed, 1 warning`. | Kết quả kiểm thử tự động ngày 17/08/2026. |
| Smoke 2 phút 50 RPS qua hạ tầng ingest: 5,999 requests, không lỗi, p95 258.94 ms. | Kết quả smoke test trong evidence pack. |
| Live run 3 giờ 50 RPS qua hạ tầng ingest: 539,974 requests, p95 256.19 ms, 19 lỗi (0.0035%). | Kết quả load test trong evidence pack. |
| Hạ tầng host và tích hợp AI path hoàn tất cho cả ba services với `AI_ENGINE`, `complete_window`, `ai_status_code=200`. | Audit evidence của AI path. |
| Chi phí thiết kế luôn bật khoảng $158–158.33/tháng, buffer 20% dưới $200. | Phân tích chi phí và quyết định kiến trúc. |

Curated evidence được lưu trong evidence pack của phiên live testing ngày 01/07/2026.

## 4. Claim không được dùng

- Không nhận vai trò xây dựng, huấn luyện hoặc tối ưu mô hình/thuật toán AI; scope là host, tích hợp và vận hành workload AI trong hạ tầng.
- Không gọi k6 3 giờ là **zero-drop pass**: có 27 dropped iterations và exit code 99 theo threshold nghiêm ngặt.
- Không suy diễn 50 RPS là AMP persist 50 samples/giây; đó là headroom của ingest API qua gauge + ADOT scrape.
- Không dùng CloudWatch service logs làm pass evidence cho curated live run.
- Không dùng Cost Explorer trong ngày làm bằng chứng chi phí cả tháng.
- Không tuyên bố đã kiểm thử cross-account tenant isolation; sandbox chỉ có một account.
- Không mô tả 50k events/giây như kết quả đã load-test; đó là design ceiling.

Nguồn: evidence pack và kế hoạch kiểm thử của dự án.

## 5. Checklist ảnh chụp và artefact

| Artefact | Trạng thái | Mục đích |
|---|---|---|
| Sơ đồ kiến trúc | Có trong bộ tài liệu thiết kế hạ tầng. | Minh họa hạ tầng và luồng dữ liệu. |
| Curated k6, preflight, audit và AMP samples | Có trong evidence pack của phiên live testing ngày 01/07/2026. | Chứng minh runtime và integration test. |
| GitHub Actions run, Terraform plan artifact | Cần chụp nếu truy cập được | Chứng minh IaC, CI/CD, review và OIDC deploy. |
| ECS cluster/services, task definition và autoscaling | Cần chụp nếu truy cập được | Chứng minh host/operate Telemetry API, Worker và AI Engine. |
| API Gateway route AWS_IAM/SigV4 | Cần chụp nếu truy cập được | Chứng minh ingress security. |
| AMP query, DynamoDB audit, SQS | Cần chụp nếu truy cập được | Chứng minh telemetry, orchestration và decision evidence. |
| CloudWatch dashboard/alarms, AWS Budget/cost breaker | Cần chụp nếu truy cập được | Chứng minh observability và cost guard. |
| Security Groups, KMS/SSM/Secrets Manager | Cần chụp metadata, không chụp secret value | Chứng minh network and secret controls. |

## 6. Thông tin phải điền ngoài repo

- Họ tên, MSSV, lớp, trường, ngành và thời gian thực tập.
- Tên, địa chỉ, lĩnh vực, mentor và đơn vị thực tập.
- Tên giảng viên hướng dẫn, ngày ký và biểu mẫu xác nhận của trường.
- Phần việc cá nhân: commit/PR/issue hạ tầng tương ứng, phạm vi đã làm, khó khăn và kết quả.
- Mốc thời gian thực hiện thực tế theo nhật ký hoặc Git history.

Không suy đoán các thông tin trên từ author name hoặc lịch sử commit của nhóm.

## 7. Preflight trước khi nộp

- [ ] Tiêu đề, mục tiêu và kiến trúc nói về vai trò xây dựng/vận hành hạ tầng ECS Fargate cho observability project, không nhầm với mẫu đề cương bên ngoài.
- [ ] AI Engine chỉ được mô tả là workload được host và tích hợp; không tuyên bố phát triển mô hình AI ngoài phạm vi.
- [ ] Mọi số liệu có đường dẫn evidence và giữ nguyên caveat liên quan.
- [ ] Câu mô tả công nghệ khớp Terraform/mã nguồn hiện hành, không dùng tài liệu hạ tầng stale làm nguồn duy nhất.
- [ ] Mỗi ảnh AWS/GitHub che token, access key, secret, account-sensitive URL nếu trường yêu cầu.
- [ ] Phần đóng góp cá nhân tập trung vào hạ tầng, có bằng chứng và được xác nhận.
- [ ] Tài liệu tham khảo trỏ vào CDO docs, contracts, evidence và Git history hiện có.
