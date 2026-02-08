# =============================================================================
# Lambda functions + deployment package
# =============================================================================
#
# All Lambdas share a single deployment ZIP built from the compiled
# TypeScript output in dist/. Each function specifies a different handler
# entry point. The AWS SDK v3 is included in the Node.js 20.x runtime,
# so the ZIP contains only application code.
#
# Build the package before deploying:
#   npm run build
#   cd terraform && terraform apply

# ---------------------------------------------------------------------------
# Deployment package
# ---------------------------------------------------------------------------

data "archive_file" "lambda_package" {
  type        = "zip"
  source_dir  = "${path.module}/../dist"
  output_path = "${path.module}/../dist.zip"
}

# ---------------------------------------------------------------------------
# Lambda functions
# ---------------------------------------------------------------------------

# API entry point -- receives HTTP requests and starts the workflow
resource "aws_lambda_function" "submit_expense" {
  function_name    = "${var.project_name}-submit"
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers/submitExpense.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = {
      EXPENSES_TABLE    = aws_dynamodb_table.expenses.name
      STATE_MACHINE_ARN = aws_sfn_state_machine.expense_workflow.arn
      LOG_LEVEL         = "INFO"
    }
  }
}

# Workflow Step 1: Validate expense claim
resource "aws_lambda_function" "validate_expense" {
  function_name    = "${var.project_name}-validate"
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers/validateExpense.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = {
      LOG_LEVEL = "INFO"
    }
  }
}

# Workflow Step 2a: Corporate policy check
resource "aws_lambda_function" "policy_check" {
  function_name    = "${var.project_name}-policy-check"
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers/policyCheck.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = {
      LOG_LEVEL = "INFO"
    }
  }
}

# Workflow Step 2b: Rule-based fraud detection
resource "aws_lambda_function" "fraud_heuristic" {
  function_name    = "${var.project_name}-fraud-check"
  role             = aws_iam_role.lambda_role.arn
  handler          = "handlers/fraudHeuristic.handler"
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  filename         = data.archive_file.lambda_package.output_path
  source_code_hash = data.archive_file.lambda_package.output_base64sha256

  environment {
    variables = {
      LOG_LEVEL = "INFO"
    }
  }
}

# Workflow Step 3: Final decision and persistence
resource "aws_lambda_function" "decision" {
  function_name    = "${var.project_name}-decision"
  role             = aws_iam_role.lambda_role.arn
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
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups (explicit creation with retention policy)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "submit" {
  name              = "/aws/lambda/${aws_lambda_function.submit_expense.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "validate" {
  name              = "/aws/lambda/${aws_lambda_function.validate_expense.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "policy_check" {
  name              = "/aws/lambda/${aws_lambda_function.policy_check.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "fraud_heuristic" {
  name              = "/aws/lambda/${aws_lambda_function.fraud_heuristic.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "decision" {
  name              = "/aws/lambda/${aws_lambda_function.decision.function_name}"
  retention_in_days = var.log_retention_days
}
