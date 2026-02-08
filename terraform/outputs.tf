# =============================================================================
# Stack outputs
# =============================================================================

output "api_endpoint" {
  description = "HTTP API Gateway endpoint URL"
  value       = "${aws_apigatewayv2_api.expense_api.api_endpoint}/prod"
}

output "state_machine_arn" {
  description = "Step Functions state machine ARN"
  value       = aws_sfn_state_machine.expense_workflow.arn
}

output "dynamodb_table_name" {
  description = "DynamoDB table name for expense records"
  value       = aws_dynamodb_table.expenses.name
}

output "submit_lambda_name" {
  description = "Submit expense Lambda function name"
  value       = aws_lambda_function.submit_expense.function_name
}
