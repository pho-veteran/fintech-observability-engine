import os
import json
import time
from datetime import datetime, timezone
import uuid
from decimal import Decimal

import boto3
import requests
from botocore.exceptions import ClientError
from requests_aws4auth import AWS4Auth

# Cấu hình biến môi trường
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL")
AMP_QUERY_ENDPOINT = os.getenv("AMP_QUERY_ENDPOINT")  # e.g., https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-xxx
AI_ENGINE_ENDPOINT = os.getenv("AI_ENGINE_ENDPOINT", "http://ai-engine.cdo-services/v1/predict")
AI_TIMEOUT_SECONDS = float(os.getenv("AI_TIMEOUT_SECONDS", "2"))
DYNAMODB_AUDIT_TABLE = os.getenv("DYNAMODB_AUDIT_TABLE", "cdo04-audit-logs")
DYNAMODB_POLICY_TABLE = os.getenv("DYNAMODB_POLICY_TABLE", "cdo04-service-policies")
ALERT_TOPIC_ARN = os.getenv("ALERT_TOPIC_ARN")

# TASK: CPOA-63 | CDO-W12-022 - Bucket alignment + imputation
# Fill policy theo từng metric: forward_fill (giá trị tồn tại) vs zero_fill (không có = 0)
METRIC_FILL_POLICY = {
    "cpu_usage_percent":      "forward_fill",
    "memory_usage_percent":   "forward_fill",
    "active_connections":     "forward_fill",
    "db_connection_pool_pct": "forward_fill",
    "queue_depth":            "zero_fill",    # không có request = queue rỗng
    "cache_hit_rate_pct":     "forward_fill",
    "api_latency_ms":         "forward_fill",
}
# Nếu tỷ lệ bucket bị thiếu vượt ngưỡng này → không gọi AI, chuyển fallback
MAX_GAP_THRESHOLD = 0.5  # 50%

DEFAULT_FALLBACK_RULES = {
    "payment-gw": [
        {"metric_type": "api_latency_ms", "operator": ">", "threshold": 1000.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "critical", "action": "SCALE_UP", "recommendation": "Scale payment-gw API capacity; latency exceeded 1000ms."},
        {"metric_type": "active_connections", "operator": ">", "threshold": 5000.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "high", "action": "SCALE_UP", "recommendation": "Scale payment-gw tasks or connection handling capacity."},
        {"metric_type": "cpu_usage_percent", "operator": ">", "threshold": 85.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "high", "action": "SCALE_UP", "recommendation": "Scale payment-gw tasks; CPU exceeded 85%."},
        {"metric_type": "memory_usage_percent", "operator": ">", "threshold": 85.0, "duration_minutes": 15, "aggregate": "avg", "risk_level": "high", "action": "SCALE_UP", "recommendation": "Scale or inspect payment-gw memory pressure."},
        {"metric_type": "db_connection_pool_pct", "operator": ">", "threshold": 80.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "high", "action": "INVESTIGATE", "recommendation": "Investigate payment-gw DB dependency; pool utilization exceeded 80%."},
        {"metric_type": "cache_hit_rate_pct", "operator": "<", "threshold": 80.0, "duration_minutes": 15, "aggregate": "min", "risk_level": "medium", "action": "INVESTIGATE", "recommendation": "Investigate payment-gw cache degradation; hit rate below 80%."},
    ],
    "ledger": [
        {"metric_type": "db_connection_pool_pct", "operator": ">", "threshold": 80.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "critical", "action": "SCALE_UP", "recommendation": "Scale ledger DB/client capacity; DB pool exceeded 80%."},
        {"metric_type": "api_latency_ms", "operator": ">", "threshold": 1000.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "high", "action": "INVESTIGATE", "recommendation": "Investigate ledger latency and database query path."},
        {"metric_type": "cpu_usage_percent", "operator": ">", "threshold": 85.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "high", "action": "SCALE_UP", "recommendation": "Scale ledger tasks; CPU exceeded 85%."},
        {"metric_type": "memory_usage_percent", "operator": ">", "threshold": 85.0, "duration_minutes": 15, "aggregate": "avg", "risk_level": "high", "action": "INVESTIGATE", "recommendation": "Investigate ledger memory pressure or leak."},
        {"metric_type": "active_connections", "operator": ">", "threshold": 3000.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "medium", "action": "INVESTIGATE", "recommendation": "Investigate ledger connection fan-in."},
        {"metric_type": "cache_hit_rate_pct", "operator": "<", "threshold": 75.0, "duration_minutes": 15, "aggregate": "min", "risk_level": "medium", "action": "INVESTIGATE", "recommendation": "Investigate ledger cache hit-rate drop."},
    ],
    "fraud-detector": [
        {"metric_type": "queue_depth", "operator": ">", "threshold": 5000.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "critical", "action": "SCALE_UP", "recommendation": "Scale fraud-detector worker concurrency; queue_depth exceeded 5000."},
        {"metric_type": "queue_depth", "operator": ">", "threshold": 1000.0, "duration_minutes": 30, "aggregate": "avg", "risk_level": "high", "action": "SCALE_UP", "recommendation": "Scale fraud-detector workers; sustained queue backlog exceeded 1000."},
        {"metric_type": "api_latency_ms", "operator": ">", "threshold": 1500.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "high", "action": "INVESTIGATE", "recommendation": "Investigate fraud-detector processing latency."},
        {"metric_type": "cpu_usage_percent", "operator": ">", "threshold": 85.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "high", "action": "SCALE_UP", "recommendation": "Scale fraud-detector workers; CPU exceeded 85%."},
        {"metric_type": "memory_usage_percent", "operator": ">", "threshold": 85.0, "duration_minutes": 15, "aggregate": "avg", "risk_level": "high", "action": "INVESTIGATE", "recommendation": "Investigate fraud-detector memory pressure."},
        {"metric_type": "active_connections", "operator": ">", "threshold": 2000.0, "duration_minutes": 10, "aggregate": "max", "risk_level": "medium", "action": "INVESTIGATE", "recommendation": "Investigate fraud-detector upstream connection pressure."},
    ],
}

RISK_PRIORITY = {"critical": 4, "high": 3, "medium": 2, "low": 1}
METRIC_PRIORITY = {
    "queue_depth": 7,
    "db_connection_pool_pct": 6,
    "api_latency_ms": 5,
    "cpu_usage_percent": 4,
    "memory_usage_percent": 3,
    "active_connections": 2,
    "cache_hit_rate_pct": 1,
}

# Khởi tạo AWS Clients
sqs = boto3.client("sqs", region_name=AWS_REGION)
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
sns = boto3.client("sns", region_name=AWS_REGION)
audit_table = dynamodb.Table(DYNAMODB_AUDIT_TABLE)
policy_table = dynamodb.Table(DYNAMODB_POLICY_TABLE)


def get_aws_auth(service):
    """
    Tạo dynamic AWS4Auth sử dụng current IAM credentials của ECS Task.
    Tránh lỗi hết hạn token khi Task chạy lâu ngày.
    """
    try:
        session = boto3.Session()
        credentials = session.get_credentials()
        if not credentials:
            return None
        frozen_creds = credentials.get_frozen_credentials()
        return AWS4Auth(
            frozen_creds.access_key,
            frozen_creds.secret_key,
            AWS_REGION,
            service,
            session_token=frozen_creds.token
        )
    except Exception as e:
        print(f"Lỗi lấy AWS credentials cho {service}: {str(e)}", flush=True)
        return None


def align_and_impute(raw_result, start_time, end_time, step_seconds=60, fill_policy="forward_fill"):
    """
    TASK: CPOA-63 | CDO-W12-022 - Bucket alignment + imputation
    OWNER: Tạ Hoàng Huy

    Align AMP query_range result thành 1-minute buckets có index liên tục.
    - forward_fill: dùng giá trị gần nhất trước đó (metric tồn tại liên tục)
    - zero_fill:    dùng 0.0 (không có request/queue = 0)

    Returns:
        aligned (dict): {timestamp_int: float} đầy đủ 120 bucket
        gap_ratio (float): tỷ lệ bucket bị thiếu trước khi impute (0.0 – 1.0)
        real_count (int): số bucket có dữ liệu thật trước khi impute
    """
    start_bucket = (int(start_time) // step_seconds) * step_seconds
    end_bucket = (int(end_time) // step_seconds) * step_seconds
    expected_timestamps = list(range(start_bucket, end_bucket + step_seconds, step_seconds))
    total_buckets = len(expected_timestamps)

    # Build actual data map từ AMP values, bucketed to 1-minute boundaries.
    actual_data = {}
    for series in raw_result:
        for ts, val in series.get("values", []):
            bucket = (int(float(ts)) // step_seconds) * step_seconds
            actual_data[bucket] = float(val)

    aligned = {}
    last_known_value = None
    missing_count = 0

    for ts in expected_timestamps:
        if ts in actual_data:
            aligned[ts] = actual_data[ts]
            last_known_value = actual_data[ts]
        else:
            missing_count += 1
            if fill_policy == "forward_fill" and last_known_value is not None:
                aligned[ts] = last_known_value   # giữ giá trị cuối
            else:
                aligned[ts] = 0.0                 # zero-fill hoặc chưa có giá trị nào

    gap_ratio = missing_count / total_buckets if total_buckets > 0 else 1.0
    return aligned, gap_ratio, len(actual_data)


def query_amp_metrics(tenant_id, service_name, duration_minutes=120):
    """
    TASK: CPOA-101 | CDO-W12-056 - AMP Query Optimization
    TASK: CPOA-63  | CDO-W12-022 - Bucket alignment + imputation
    OWNER: Tạ Hoàng Huy

    Truy vấn tuần tự 7 tín hiệu cốt lõi từ AMP, sau đó align và impute thành
    1-minute buckets theo METRIC_FILL_POLICY.
    Trả về (aligned_metrics, max_gap_ratio, start_time, end_time,
    metric_gap_ratios, metric_real_counts) — caller quyết định có gọi AI không.
    """
    end_time = int(time.time())
    start_time = end_time - (duration_minutes * 60)

    signals = [
        "cpu_usage_percent",
        "memory_usage_percent",
        "active_connections",
        "db_connection_pool_pct",
        "queue_depth",
        "cache_hit_rate_pct",
        "api_latency_ms"
    ]

    aligned_metrics = {}
    max_gap_ratio = 0.0
    metric_gap_ratios = {}
    metric_real_counts = {}
    amp_base_url = AMP_QUERY_ENDPOINT.rstrip("/").removesuffix("/api/v1/query")
    url = f"{amp_base_url}/api/v1/query_range"

    # Tạo auth client động cho Prometheus (AMP)
    amp_auth = get_aws_auth("aps")

    for signal in signals:
        # Bảo vệ quota bằng cách lọc tường minh tenant_id và service_id
        query = f'{signal}{{tenant_id="{tenant_id}", service_id="{service_name}"}}'
        params = {
            "query": query,
            "start": start_time,
            "end": end_time,
            "step": "60s"
        }

        raw_result = []
        try:
            print(f"Executing PromQL query: {query}", flush=True)
            response = requests.get(url, auth=amp_auth, params=params, timeout=10)
            if response.status_code == 200:
                raw_result = response.json().get("data", {}).get("result", [])
            else:
                print(f"Lỗi truy vấn AMP cho {signal}: HTTP {response.status_code} - {response.text}", flush=True)
        except Exception as e:
            print(f"Không thể kết nối AMP để truy vấn {signal}: {str(e)}", flush=True)

        # Align và impute bucket theo metric policy
        fill_policy = METRIC_FILL_POLICY.get(signal, "forward_fill")
        aligned, gap_ratio, real_count = align_and_impute(raw_result, start_time, end_time, fill_policy=fill_policy)
        aligned_metrics[signal] = aligned
        max_gap_ratio = max(max_gap_ratio, gap_ratio)
        metric_gap_ratios[signal] = gap_ratio
        metric_real_counts[signal] = real_count

        if gap_ratio > 0:
            print(f"Signal '{signal}': gap_ratio={gap_ratio:.1%}, real_count={real_count} → {fill_policy}", flush=True)

    return aligned_metrics, max_gap_ratio, start_time, end_time, metric_gap_ratios, metric_real_counts


def get_static_threshold_fallback(tenant_id, service_name):
    """
    Lấy static threshold từ DynamoDB policy table để fallback
    """
    try:
        response = policy_table.get_item(Key={"tenant_id": tenant_id, "service_name": service_name})
        if "Item" in response:
            return float(response["Item"].get("static_threshold", 85.0))  # Default 85%
    except Exception as e:
        print(f"Lỗi đọc DynamoDB policy table: {str(e)}", flush=True)
    return 85.0


def aggregate_rule_values(ts_val_map, duration_minutes, aggregate):
    """Aggregate latest N one-minute buckets for a fallback rule."""
    if not ts_val_map:
        return None

    ordered = sorted(ts_val_map.items())
    window = ordered[-max(int(duration_minutes), 1):]
    values = [float(value) for _, value in window if value is not None]
    if not values:
        return None

    if aggregate == "max":
        return max(values)
    if aggregate == "min":
        return min(values)
    return sum(values) / len(values)


def compare_rule(observed, operator, threshold):
    """Compare observed metric value with fallback rule threshold."""
    if operator == ">":
        return observed > threshold
    if operator == "<":
        return observed < threshold
    return False


def _rule_ratio(observed, operator, threshold):
    if threshold <= 0:
        return 0.0
    if operator == "<":
        if observed <= 0:
            return float("inf")
        return threshold / observed
    return observed / threshold


def _fallback_recommendation(rule, tenant_id, service_name, confidence):
    return {
        "action_verb": rule["action"],
        "target": service_name,
        "from_to": "current->review capacity",
        "confidence": confidence,
        "evidence_link": f"amp://{tenant_id}/{service_name}/{rule['metric_type']}",
    }


def compute_metric_fallback(aligned_metrics, metric_gap_ratios, metric_real_counts, tenant_id, service_name):
    """Compute fallback decision from actual AMP metric windows before static fallback."""
    rules = DEFAULT_FALLBACK_RULES.get(service_name, [])
    best_pressure = None
    breached = []

    for index, rule in enumerate(rules):
        metric_type = rule["metric_type"]
        if metric_real_counts.get(metric_type, 0) <= 0:
            continue

        observed = aggregate_rule_values(
            aligned_metrics.get(metric_type, {}),
            rule["duration_minutes"],
            rule.get("aggregate", "max"),
        )
        if observed is None:
            continue

        ratio = _rule_ratio(observed, rule["operator"], rule["threshold"])
        pressure = {
            "rule": rule,
            "observed": observed,
            "ratio": ratio,
            "index": index,
        }
        if best_pressure is None or ratio > best_pressure["ratio"]:
            best_pressure = pressure
        if compare_rule(observed, rule["operator"], rule["threshold"]):
            breached.append(pressure)

    if best_pressure is None:
        return None

    if not breached:
        rule = best_pressure["rule"]
        ratio = best_pressure["ratio"]
        return {
            "decision": "KEEP_ALIVE",
            "score": min(ratio * 100.0, 100.0),
            "anomaly": False,
            "severity": min(ratio, 1.0),
            "reasoning": (
                "Metric-derived static fallback found no breached rules; "
                f"highest pressure was {service_name} {rule['metric_type']} "
                f"{rule.get('aggregate', 'max')}={best_pressure['observed']:.2f} "
                f"{rule['operator']} threshold={rule['threshold']} ratio={ratio:.2f}."
            ),
            "recommendation": None,
        }

    def sort_key(item):
        rule = item["rule"]
        return (
            RISK_PRIORITY.get(rule.get("risk_level", "low"), 0),
            item["ratio"],
            METRIC_PRIORITY.get(rule["metric_type"], 0),
            -item["index"],
        )

    winner = max(breached, key=sort_key)
    rule = winner["rule"]
    ratio = winner["ratio"]
    confidence = min(ratio, 1.0)
    return {
        "decision": rule["action"],
        "score": min(ratio * 100.0, 100.0),
        "anomaly": True,
        "severity": confidence,
        "reasoning": (
            "Metric-derived static fallback rule breach: "
            f"{service_name} {rule['metric_type']} {rule.get('aggregate', 'max')}={winner['observed']:.2f} "
            f"{rule['operator']} threshold={rule['threshold']} over {rule['duration_minutes']}m; "
            f"risk={rule['risk_level']} ratio={ratio:.2f}. {rule['recommendation']}"
        ),
        "recommendation": _fallback_recommendation(rule, tenant_id, service_name, confidence),
    }


def as_dynamodb_number(value):
    """Convert Python numeric values to DynamoDB-safe Decimal values."""
    return Decimal(str(value))


def save_audit_log(
    prediction_id, tenant_id, service_name, decision, prediction_source, score,
    evidence_status="complete_window", anomaly=False, severity=0.0, reasoning="",
    recommendation=None, audit_id=None, ai_status_code=0, ai_latency_ms=0,
    deployment_version="v1.0.0", baseline_version="v1.0.0", prediction_status="complete"
):
    """
    TASK: CPOA-103 | CDO-W12-058 - Retention policies
    TASK: CPOA-63  | CDO-W12-022 - Bucket alignment + imputation (evidence_status)
    TASK: CPOA-68  | CDO-W12-027 - DynamoDB audit write (rich fields & idempotency check)
    OWNER: Tạ Hoàng Huy

    Lưu quyết định dự báo vào DynamoDB Audit Logs Table kèm TTL 90 ngày.
    Dùng ConditionExpression để đảm bảo tính Idempotency (CPOA-70).
    Lưu score và các trường dạng số đúng kiểu dữ liệu Number.
    """
    now = datetime.now(timezone.utc)
    now_epoch = int(now.timestamp())
    retention_seconds = 90 * 24 * 60 * 60
    expires_at_epoch = now_epoch + retention_seconds

    # Định nghĩa bản ghi với tất cả các design fields theo feedback
    item = {
        "tenant_id": tenant_id,
        "service_time": now.isoformat(),
        "prediction_status": prediction_status,
        "prediction_timestamp": now.isoformat(),
        "prediction_id": prediction_id,
        "service_name": service_name,
        "service_id": service_name,
        "timestamp": now_epoch,
        "decision": decision,
        "prediction_source": prediction_source,
        "score": as_dynamodb_number(score),
        "evidence_status": evidence_status,
        "anomaly": anomaly,
        "severity": as_dynamodb_number(severity),
        "reasoning": reasoning,
        "ai_status_code": as_dynamodb_number(ai_status_code),
        "ai_latency_ms": as_dynamodb_number(ai_latency_ms),
        "deployment_version": deployment_version,
        "baseline_version": baseline_version,
        "expires_at_epoch": expires_at_epoch
    }

    # Bổ sung các thông tin recommendation nếu có
    if recommendation:
        item["recommendation_action"] = recommendation.get("action_verb", "INVESTIGATE")
        item["recommendation_target"] = recommendation.get("target", "")
        item["recommendation_from_to"] = recommendation.get("from_to", "")
        item["recommendation_confidence"] = as_dynamodb_number(recommendation.get("confidence", 0.0))
        item["recommendation_evidence"] = recommendation.get("evidence_link", "")

    if audit_id:
        item["audit_id"] = str(audit_id)

    try:
        # Idempotency Check: Chỉ ghi nếu cặp (tenant_id, service_time) chưa tồn tại
        audit_table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(tenant_id) AND attribute_not_exists(service_time)"
        )
        print(f"Successfully saved audit log for prediction: {prediction_id}", flush=True)
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            print(f"Idempotency warning: Audit log already exists for tenant {tenant_id} at this time. Skipping.", flush=True)
        else:
            print(f"Lỗi ghi DynamoDB audit log: {str(e)}", flush=True)
            raise e


def publish_sns_alert(prediction_id, tenant_id, service_name, decision, severity, reasoning):
    """
    TASK: CPOA-69 | CDO-W12-028 - SNS high-risk alert
    Gửi thông báo khẩn cấp tới SNS topic khi phát hiện anomaly hoặc hành động SCALE_UP/RETIRE nguy cơ cao.
    """
    if not ALERT_TOPIC_ARN or ALERT_TOPIC_ARN == "*":
        print("SNS Alert topic ARN is not configured or empty. Skipping alert.", flush=True)
        return

    subject = f"🔴 CDO High-Risk Alert: Anomaly detected on {service_name}"
    message = {
        "prediction_id": prediction_id,
        "tenant_id": tenant_id,
        "service_name": service_name,
        "decision": decision,
        "severity": severity,
        "reasoning": reasoning,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "alert_type": "HIGH_RISK_PREDICTION"
    }

    try:
        sns.publish(
            TopicArn=ALERT_TOPIC_ARN,
            Subject=subject,
            Message=json.dumps(message, indent=2)
        )
        print(f"Successfully published high-risk alert to SNS: {ALERT_TOPIC_ARN}", flush=True)
    except Exception as e:
        print(f"Lỗi gửi SNS alert: {str(e)}", flush=True)


def process_job(job_data, message_id=None):
    """
    Xử lý một bản tin dự báo từ SQS
    """
    # 1. Parse các trường dữ liệu bắt buộc từ SQS Body
    prediction_id = job_data.get("correlation_id") or job_data.get("prediction_id") or message_id or str(uuid.uuid4())
    tenant_id = job_data.get("tenant_id")
    service_name = job_data.get("service_id") or job_data.get("service_name")
    lookback_window_minutes = job_data.get("lookback_window_minutes")
    
    if not tenant_id or not service_name:
        raise ValueError("Thiếu trường thông tin bắt buộc: tenant_id, service_id/service_name")

    # 2. Production uses 120 minutes; the disposable report lab uses 30 minutes.
    if lookback_window_minutes is not None:
        try:
            lookback_val = int(lookback_window_minutes)
        except (TypeError, ValueError):
            raise ValueError(f"lookback_window_minutes không đúng định dạng số: {lookback_window_minutes}")
        if lookback_val not in {30, 120}:
            raise ValueError(
                f"Xác thực thất bại: lookback_window_minutes phải bằng 30 hoặc 120 "
                f"(nhận được: {lookback_val})"
            )
    else:
        # Preserve the production contract when the scheduler omits the field.
        lookback_val = 120

    print(f"Đang xử lý job {prediction_id} cho tenant {tenant_id} với lookback {lookback_val} phút...", flush=True)
    
    # 3. Query metrics từ AMP với bucket alignment (CPOA-63)
    aligned_metrics, max_gap_ratio, start_time, end_time, metric_gap_ratios, metric_real_counts = query_amp_metrics(
        tenant_id,
        service_name,
        duration_minutes=lookback_val,
    )

    # Xác định evidence_status: partial nếu có bất kỳ bucket bị thiếu
    evidence_status = "partial_window" if max_gap_ratio > 0.0 else "complete_window"
    print(f"Signal window: gap_ratio={max_gap_ratio:.1%} → evidence_status='{evidence_status}'", flush=True)

    # 4. Tạo signal_window và context payload theo đúng contract (CPOA-64)
    signal_window = []
    for metric_type, ts_val_map in aligned_metrics.items():
        for ts_int, val in ts_val_map.items():
            ts_iso = datetime.fromtimestamp(ts_int, tz=timezone.utc).isoformat().replace("+00:00", "Z")
            signal_window.append({
                "ts": ts_iso,
                "tenant_id": tenant_id,
                "service_id": service_name,
                "metric_type": metric_type,
                "value": float(val),
                "labels": {}
            })

    start_iso = datetime.fromtimestamp(start_time, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    end_iso = datetime.fromtimestamp(end_time, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    deployment_version = os.getenv("DEPLOYMENT_VERSION", "v1.0.0")

    payload = {
        "signal_window": signal_window,
        "context": {
            "deployment_version": deployment_version,
            "time_range": {
                "start_ts": start_iso,
                "end_ts": end_iso
            }
        }
    }

    # 5. Kiểm tra: nếu data gap quá lớn → không gọi AI, chuyển fallback ngay
    decision = "UNKNOWN"
    score = 0.0
    prediction_source = "AI_ENGINE"
    anomaly = False
    severity = 0.0
    reasoning = ""
    recommendation = None
    audit_id = None
    ai_status_code = 0
    ai_latency_ms = 0
    prediction_status = "complete"

    if max_gap_ratio >= MAX_GAP_THRESHOLD:
        print(f"Data gap {max_gap_ratio:.1%} vượt ngưỡng {MAX_GAP_THRESHOLD:.0%}. Không gọi AI, kích hoạt fallback.", flush=True)
        prediction_source = "STATIC_THRESHOLD_FALLBACK"
        prediction_status = "fallback"
        reasoning = f"Data gap {max_gap_ratio:.1%} too large. Triggered fallback."
    elif aligned_metrics:
        # 6. Gọi AI Engine bằng IAM SigV4 và validate response schema (CPOA-65, CPOA-66, CPOA-67)
        headers = {
            "X-Tenant-Id": tenant_id,
            "X-Correlation-Id": prediction_id,
            "Content-Type": "application/json"
        }
        
        # Tạo auth client động cho AI Engine
        ai_auth = get_aws_auth("execute-api")
        
        t0 = time.time()
        try:
            response = requests.post(
                AI_ENGINE_ENDPOINT,
                json=payload,
                headers=headers,
                auth=ai_auth,
                timeout=AI_TIMEOUT_SECONDS
            )
            ai_status_code = response.status_code
            ai_latency_ms = int((time.time() - t0) * 1000)

            if response.status_code == 200:
                result = response.json()
                
                # Validation schema (CPOA-67)
                if not isinstance(result, dict):
                    raise ValueError("AI response is not a JSON object")
                if "anomaly" not in result or not isinstance(result["anomaly"], bool):
                    raise ValueError("Missing or invalid 'anomaly' field")
                if "severity" not in result or not isinstance(result["severity"], (int, float)):
                    raise ValueError("Missing or invalid 'severity' field")
                if "reasoning" not in result or not isinstance(result["reasoning"], str):
                    raise ValueError("Missing or invalid 'reasoning' field")
                
                rec = result.get("recommendation")
                if rec is not None:
                    if not isinstance(rec, dict):
                        raise ValueError("Invalid 'recommendation' object")
                    for field in ["action_verb", "target", "from_to", "confidence", "evidence_link"]:
                        if field not in rec:
                            raise ValueError(f"Missing field '{field}' in recommendation")
                    if rec["action_verb"] not in ["SCALE_UP", "SCALE_DOWN", "RETIRE", "ROLLBACK", "INVESTIGATE"]:
                        raise ValueError(f"Invalid action_verb: {rec['action_verb']}")
                    if not isinstance(rec["confidence"], (int, float)):
                        raise ValueError("Invalid recommendation confidence score")

                # Parse kết quả sau khi pass validation
                anomaly = result["anomaly"]
                severity = float(result["severity"])
                reasoning = result["reasoning"]
                recommendation = rec
                audit_id = result.get("audit_id")
                
                if recommendation:
                    decision = recommendation["action_verb"]
                    score = float(recommendation.get("confidence", 0.0))
                else:
                    decision = "KEEP_ALIVE"
                    score = severity
                
            else:
                print(f"AI Engine trả về lỗi {response.status_code}. Kích hoạt Fallback.", flush=True)
                prediction_source = "STATIC_THRESHOLD_FALLBACK"
                prediction_status = "fallback"
                reasoning = f"AI Engine returned error HTTP {response.status_code}. Triggered fallback."
        except Exception as e:
            ai_latency_ms = int((time.time() - t0) * 1000)
            print(f"AI Engine không phản hồi: {str(e)}. Kích hoạt Fallback.", flush=True)
            prediction_source = "STATIC_THRESHOLD_FALLBACK"
            prediction_status = "fallback"
            reasoning = f"AI Engine call exception: {str(e)}. Triggered fallback."
    else:
        print("Địa chỉ AMP không trả về dữ liệu. Kích hoạt Fallback.", flush=True)
        prediction_source = "STATIC_THRESHOLD_FALLBACK"
        prediction_status = "fallback"
        reasoning = "No AMP metrics data available. Triggered fallback."

    # 7. Thực hiện tính toán fallback nếu cần
    if prediction_source == "STATIC_THRESHOLD_FALLBACK":
        fallback_reason = reasoning
        metric_fallback = compute_metric_fallback(
            aligned_metrics,
            metric_gap_ratios,
            metric_real_counts,
            tenant_id,
            service_name,
        )
        if metric_fallback:
            decision = metric_fallback["decision"]
            score = metric_fallback["score"]
            anomaly = metric_fallback["anomaly"]
            severity = metric_fallback["severity"]
            reasoning = f"{fallback_reason} {metric_fallback['reasoning']}".strip()
            recommendation = metric_fallback["recommendation"]
        else:
            threshold = get_static_threshold_fallback(tenant_id, service_name)
            score = threshold
            decision = "SCALE_UP" if score > 80.0 else "KEEP_ALIVE"
            anomaly = score > 80.0
            severity = score / 100.0
            reasoning = f"{fallback_reason} No usable metric window; used static threshold fallback.".strip()

    # 8. Lưu Audit Log kèm đầy đủ thông tin (CPOA-68)
    save_audit_log(
        prediction_id=prediction_id,
        tenant_id=tenant_id,
        service_name=service_name,
        decision=decision,
        prediction_source=prediction_source,
        score=score,
        evidence_status=evidence_status,
        anomaly=anomaly,
        severity=severity,
        reasoning=reasoning,
        recommendation=recommendation,
        audit_id=audit_id,
        ai_status_code=ai_status_code,
        ai_latency_ms=ai_latency_ms,
        deployment_version=deployment_version,
        prediction_status=prediction_status
    )

    # 9. Gửi cảnh báo SNS nếu phát hiện anomaly nguy cơ cao (CPOA-69)
    if anomaly and (severity >= 0.8 or decision in ["SCALE_UP", "RETIRE"]):
        publish_sns_alert(prediction_id, tenant_id, service_name, decision, severity, reasoning)


def main():
    print("Worker đã khởi động và đang đợi tin nhắn từ SQS...", flush=True)
    while True:
        try:
            # Nhận tin nhắn từ SQS (Long Polling 20 giây)
            response = sqs.receive_message(
                QueueUrl=SQS_QUEUE_URL,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=20
            )
            
            messages = response.get("Messages", [])
            for message in messages:
                body = json.loads(message["Body"])
                
                # Bọc try-catch riêng cho từng message để xử lý retry/DLQ (CPOA-61)
                try:
                    process_job(body, message_id=message.get("MessageId"))
                    # Xóa tin nhắn khỏi hàng đợi sau khi xử lý thành công
                    sqs.delete_message(
                        QueueUrl=SQS_QUEUE_URL,
                        ReceiptHandle=message["ReceiptHandle"]
                    )
                except Exception as inner_e:
                    print(f"Lỗi xử lý tin nhắn {message.get('MessageId')}: {str(inner_e)}", flush=True)
                    # Không xóa tin nhắn để SQS tự động retry dựa trên visibility timeout / maxReceiveCount
                    # Sau giới hạn retry limit, SQS sẽ tự động đưa vào DLQ
        except ClientError as e:
            print(f"Lỗi SQS Client: {str(e)}", flush=True)
            time.sleep(5)
        except Exception as e:
            print(f"Lỗi không xác định: {str(e)}", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
