# =============================================================================
# AWS Step Functions State Machines (V1 + V2)
# =============================================================================
#
# Both workflow versions are deployed. The SubmitExpense Lambda selects
# which one to start based on the WORKFLOW_VERSION environment variable.
#
# V1 (Standard): Validate -> Parallel(Policy, Fraud) -> Decision
# V2 (Manual):   Same + WaitForManualApproval for NEEDS_MANUAL_REVIEW
#
# Standard Workflows are chosen over Express for the 4,000 free
# state transitions per month (Express has no free tier).

resource "aws_sfn_state_machine" "expense_workflow_v1" {
  name     = "ExpenseApprovalV1"
  role_arn = aws_iam_role.sfn_role.arn

  definition = templatefile("${path.module}/../statemachine/expense_workflow.asl.json", {
    ValidateExpenseFunctionArn = aws_lambda_function.validate_expense.arn
    PolicyCheckFunctionArn     = aws_lambda_function.policy_check.arn
    FraudHeuristicFunctionArn  = aws_lambda_function.fraud_heuristic.arn
    DecisionFunctionArn        = aws_lambda_function.decision.arn
  })

  tags = {
    Name    = "ExpenseApprovalV1"
    Version = "V1"
  }
}

resource "aws_sfn_state_machine" "expense_workflow_v2" {
  name     = "ExpenseApprovalV2"
  role_arn = aws_iam_role.sfn_role.arn

  definition = templatefile("${path.module}/../statemachine/expense_workflow_v2.asl.json", {
    ValidateExpenseFunctionArn = aws_lambda_function.validate_expense.arn
    PolicyCheckFunctionArn     = aws_lambda_function.policy_check.arn
    FraudHeuristicFunctionArn  = aws_lambda_function.fraud_heuristic.arn
    DecisionFunctionArn        = aws_lambda_function.decision.arn
    StoreTaskTokenFunctionArn  = aws_lambda_function.decision.arn
  })

  tags = {
    Name    = "ExpenseApprovalV2"
    Version = "V2"
  }
}
