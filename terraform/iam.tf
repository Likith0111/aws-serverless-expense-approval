# =============================================================================
# IAM roles and policies (least-privilege, separated by function)
# =============================================================================
#
# Three roles are defined:
#   1. API Lambda role       -- used by the SubmitExpense Lambda (API Gateway)
#   2. Workflow Lambda role   -- used by workflow step Lambdas (Step Functions)
#   3. Step Functions role    -- used by the state machine to invoke Lambdas
#
# Separation rationale:
#   The API Lambda needs StartExecution + DynamoDB read access.
#   Workflow Lambdas need DynamoDB write but NOT StartExecution.
#   Splitting roles enforces least-privilege at the role boundary.

# ---------------------------------------------------------------------------
# API Lambda role (SubmitExpense)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "api_lambda_role" {
  name = "${var.project_name}-api-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = { Name = "${var.project_name}-api-lambda-role" }
}

resource "aws_iam_role_policy_attachment" "api_lambda_basic" {
  role       = aws_iam_role.api_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "api_lambda_dynamodb" {
  name = "${var.project_name}-api-lambda-dynamodb"
  role = aws_iam_role.api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:Query"]
      Resource = [
        aws_dynamodb_table.expenses.arn,
        "${aws_dynamodb_table.expenses.arn}/index/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "api_lambda_sfn" {
  name = "${var.project_name}-api-lambda-sfn"
  role = aws_iam_role.api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "states:StartExecution"
      Resource = [
        aws_sfn_state_machine.expense_workflow_v1.arn,
        aws_sfn_state_machine.expense_workflow_v2.arn,
      ]
    }]
  })
}

# ---------------------------------------------------------------------------
# Workflow Lambda role (Validate, PolicyCheck, FraudHeuristic, Decision)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "workflow_lambda_role" {
  name = "${var.project_name}-workflow-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = { Name = "${var.project_name}-workflow-lambda-role" }
}

resource "aws_iam_role_policy_attachment" "workflow_lambda_basic" {
  role       = aws_iam_role.workflow_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "workflow_lambda_dynamodb" {
  name = "${var.project_name}-workflow-lambda-dynamodb"
  role = aws_iam_role.workflow_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query"]
      Resource = [
        aws_dynamodb_table.expenses.arn,
        "${aws_dynamodb_table.expenses.arn}/index/*",
      ]
    }]
  })
}

# ---------------------------------------------------------------------------
# Step Functions execution role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "sfn_role" {
  name = "${var.project_name}-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "states.amazonaws.com" }
    }]
  })

  tags = { Name = "${var.project_name}-sfn-role" }
}

resource "aws_iam_role_policy" "sfn_lambda_invoke" {
  name = "${var.project_name}-sfn-lambda-invoke"
  role = aws_iam_role.sfn_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "lambda:InvokeFunction"
      Resource = [
        aws_lambda_function.validate_expense.arn,
        aws_lambda_function.policy_check.arn,
        aws_lambda_function.fraud_heuristic.arn,
        aws_lambda_function.decision.arn,
      ]
    }]
  })
}
