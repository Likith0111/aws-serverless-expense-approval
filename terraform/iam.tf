# =============================================================================
# IAM roles and policies (least-privilege)
# =============================================================================
#
# Two roles are defined:
#   1. Lambda execution role   -- used by all Lambda functions.
#   2. Step Functions role      -- used by the state machine to invoke Lambdas.
#
# Each policy grants only the minimum permissions required.

# ---------------------------------------------------------------------------
# Lambda execution role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# CloudWatch Logs -- required for all Lambdas
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB -- only PutItem, GetItem, Query (no Scan, no Delete)
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.project_name}-lambda-dynamodb"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
        ]
        Resource = [
          aws_dynamodb_table.expenses.arn,
          "${aws_dynamodb_table.expenses.arn}/index/*",
        ]
      }
    ]
  })
}

# Step Functions -- only StartExecution (used by submit Lambda)
resource "aws_iam_role_policy" "lambda_step_functions" {
  name = "${var.project_name}-lambda-sfn"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "states:StartExecution"
        Resource = aws_sfn_state_machine.expense_workflow.arn
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Step Functions execution role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "sfn_role" {
  name = "${var.project_name}-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Principal = {
          Service = "states.amazonaws.com"
        }
      }
    ]
  })
}

# Allow the state machine to invoke only the specific workflow Lambdas
resource "aws_iam_role_policy" "sfn_lambda_invoke" {
  name = "${var.project_name}-sfn-lambda-invoke"
  role = aws_iam_role.sfn_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "lambda:InvokeFunction"
        Resource = [
          aws_lambda_function.validate_expense.arn,
          aws_lambda_function.policy_check.arn,
          aws_lambda_function.fraud_heuristic.arn,
          aws_lambda_function.decision.arn,
        ]
      }
    ]
  })
}
