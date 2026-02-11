# =============================================================================
# Stack outputs
# =============================================================================

output "api_endpoint" {
  description = "HTTP API Gateway endpoint URL"
  value       = "${aws_apigatewayv2_api.expense_api.api_endpoint}/prod"
}

output "state_machine_v1_arn" {
  description = "Step Functions V1 state machine ARN"
  value       = aws_sfn_state_machine.expense_workflow_v1.arn
}

output "state_machine_v2_arn" {
  description = "Step Functions V2 state machine ARN (with manual approval)"
  value       = aws_sfn_state_machine.expense_workflow_v2.arn
}

output "dynamodb_expenses_table_name" {
  description = "DynamoDB table name for expense records"
  value       = aws_dynamodb_table.expenses.name
}

output "dynamodb_users_table_name" {
  description = "DynamoDB table name for user records"
  value       = aws_dynamodb_table.users.name
}

output "submit_lambda_name" {
  description = "Submit expense Lambda function name"
  value       = aws_lambda_function.submit_expense.function_name
}
