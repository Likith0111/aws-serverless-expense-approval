# =============================================================================
# AWS Step Functions State Machine (Standard Workflow)
# =============================================================================
#
# Standard Workflows are chosen over Express because they include 4,000
# free state transitions per month. Express Workflows have no free tier.
#
# The state machine definition is loaded from the ASL JSON file using
# Terraform's templatefile() function, which substitutes Lambda ARNs
# at deploy time.

resource "aws_sfn_state_machine" "expense_workflow" {
  name     = "ExpenseApprovalWorkflow"
  role_arn = aws_iam_role.sfn_role.arn

  definition = templatefile("${path.module}/../statemachine/expense_workflow.asl.json", {
    ValidateExpenseFunctionArn = aws_lambda_function.validate_expense.arn
    PolicyCheckFunctionArn     = aws_lambda_function.policy_check.arn
    FraudHeuristicFunctionArn  = aws_lambda_function.fraud_heuristic.arn
    DecisionFunctionArn        = aws_lambda_function.decision.arn
  })

  tags = {
    Name = "ExpenseApprovalWorkflow"
  }
}
