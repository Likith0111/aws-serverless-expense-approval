# =============================================================================
# Amazon API Gateway (HTTP API v2)
# =============================================================================
#
# HTTP API chosen over REST API for:
#   - 71% lower cost per million requests
#   - Lower latency
#   - 1M free requests/month (first 12 months)
#
# Rate limiting is enforced via default_route_settings.

resource "aws_apigatewayv2_api" "expense_api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
  description   = "HTTP API for expense claim submission and retrieval"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type"]
  }

  tags = {
    Name = "${var.project_name}-api"
  }
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.expense_api.id
  name        = "prod"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.api_throttle_rate_limit
    throttling_burst_limit = var.api_throttle_burst_limit
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
    })
  }

  tags = {
    Name = "${var.project_name}-stage-prod"
  }
}

# ---------------------------------------------------------------------------
# Integration (Lambda proxy)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "submit_expense" {
  api_id                 = aws_apigatewayv2_api.expense_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.submit_expense.invoke_arn
  payload_format_version = "2.0"
}

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_route" "post_expense" {
  api_id    = aws_apigatewayv2_api.expense_api.id
  route_key = "POST /expense"
  target    = "integrations/${aws_apigatewayv2_integration.submit_expense.id}"
}

resource "aws_apigatewayv2_route" "get_expense" {
  api_id    = aws_apigatewayv2_api.expense_api.id
  route_key = "GET /expense/{expenseId}"
  target    = "integrations/${aws_apigatewayv2_integration.submit_expense.id}"
}

resource "aws_apigatewayv2_route" "get_expenses_by_employee" {
  api_id    = aws_apigatewayv2_api.expense_api.id
  route_key = "GET /expenses/employee/{employeeId}"
  target    = "integrations/${aws_apigatewayv2_integration.submit_expense.id}"
}

# ---------------------------------------------------------------------------
# Lambda permission
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "api_gateway_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.submit_expense.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.expense_api.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# API Gateway CloudWatch log group
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-api"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-apigateway-logs"
  }
}
