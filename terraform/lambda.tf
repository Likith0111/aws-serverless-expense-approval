# =============================================================================
# Lambda functions + deployment package
# =============================================================================

data "archive_file" "lambda_package" {
  type        = "zip"
  source_dir  = "${path.module}/../dist"
  output_path = "${path.module}/../dist.zip"
}

# ---------------------------------------------------------------------------
# API Lambda (uses api_lambda_role -- can start workflows + read DynamoDB)
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "submit_expense" {
  function_name    = "${var.project_name}-submit"
  role             = aws_iam_role.api_lambda_role.arn
  handler          = "handlers/submitExpense.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = {
      EXPENSES_TABLE      = aws_dynamodb_table.expenses.name
      STATE_MACHINE_ARN   = aws_sfn_state_machine.expense_workflow_v1.arn
      WORKFLOW_VERSION    = "V1"
      EMPLOYEE_INDEX_NAME = "EmployeeIndex"
      LOG_LEVEL           = "INFO"
    }
  }

  tags = { Name = "${var.project_name}-submit" }
}

# ---------------------------------------------------------------------------
# Workflow Lambdas (use workflow_lambda_role -- can write to DynamoDB)
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "validate_expense" {
  function_name    = "${var.project_name}-validate"
  role             = aws_iam_role.workflow_lambda_role.arn
  handler          = "handlers/validateExpense.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = { LOG_LEVEL = "INFO" }
  }

  tags = { Name = "${var.project_name}-validate" }
}

resource "aws_lambda_function" "policy_check" {
  function_name    = "${var.project_name}-policy-check"
  role             = aws_iam_role.workflow_lambda_role.arn
  handler          = "handlers/policyCheck.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = { LOG_LEVEL = "INFO" }
  }

  tags = { Name = "${var.project_name}-policy-check" }
}

resource "aws_lambda_function" "fraud_heuristic" {
  function_name    = "${var.project_name}-fraud-check"
  role             = aws_iam_role.workflow_lambda_role.arn
  handler          = "handlers/fraudHeuristic.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = {
      LOG_LEVEL     = "INFO"
      CHAOS_ENABLED = "false"
    }
  }

  tags = { Name = "${var.project_name}-fraud-check" }
}

resource "aws_lambda_function" "decision" {
  function_name    = "${var.project_name}-decision"
  role             = aws_iam_role.workflow_lambda_role.arn
  handler          = "handlers/decision.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = {
      EXPENSES_TABLE = aws_dynamodb_table.expenses.name
      LOG_LEVEL      = "INFO"
    }
  }

  tags = { Name = "${var.project_name}-decision" }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "submit" {
  name              = "/aws/lambda/${aws_lambda_function.submit_expense.function_name}"
  retention_in_days = var.log_retention_days
  tags              = { Name = "${var.project_name}-submit-logs" }
}

resource "aws_cloudwatch_log_group" "validate" {
  name              = "/aws/lambda/${aws_lambda_function.validate_expense.function_name}"
  retention_in_days = var.log_retention_days
  tags              = { Name = "${var.project_name}-validate-logs" }
}

resource "aws_cloudwatch_log_group" "policy_check" {
  name              = "/aws/lambda/${aws_lambda_function.policy_check.function_name}"
  retention_in_days = var.log_retention_days
  tags              = { Name = "${var.project_name}-policy-check-logs" }
}

resource "aws_cloudwatch_log_group" "fraud_heuristic" {
  name              = "/aws/lambda/${aws_lambda_function.fraud_heuristic.function_name}"
  retention_in_days = var.log_retention_days
  tags              = { Name = "${var.project_name}-fraud-check-logs" }
}

resource "aws_cloudwatch_log_group" "decision" {
  name              = "/aws/lambda/${aws_lambda_function.decision.function_name}"
  retention_in_days = var.log_retention_days
  tags              = { Name = "${var.project_name}-decision-logs" }
}
