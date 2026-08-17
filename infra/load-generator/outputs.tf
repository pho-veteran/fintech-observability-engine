output "instance_id" {
  description = "EC2 instance ID for the isolated load generator"
  value       = aws_instance.generator.id
}

output "public_ip" {
  description = "Ephemeral public IPv4 used for outbound access"
  value       = aws_instance.generator.public_ip
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for generator status logs"
  value       = aws_cloudwatch_log_group.generator.name
}

output "ssm_start_session_command" {
  description = "Command to access the machine without SSH"
  value       = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.generator.id}"
}

output "service_status_command" {
  description = "Command to inspect the k6 systemd unit through SSM Run Command"
  value       = "aws ssm send-command --region ${var.aws_region} --instance-ids ${aws_instance.generator.id} --document-name AWS-RunShellScript --parameters commands='systemctl status foresight-k6 --no-pager'"
}
