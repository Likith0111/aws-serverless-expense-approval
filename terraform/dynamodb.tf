# =============================================================================
# DynamoDB table
# =============================================================================
#
# On-demand (PAY_PER_REQUEST) billing eliminates capacity planning and
# ensures zero cost at rest. Free tier includes 25 WCU + 25 RCU always-free.
#
# A Global Secondary Index on employeeId enables efficient queries to
# retrieve all expenses for a given employee.

resource "aws_dynamodb_table" "expenses" {
  name         = "ExpenseApprovals"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "expenseId"

  attribute {
    name = "expenseId"
    type = "S"
  }

  attribute {
    name = "employeeId"
    type = "S"
  }

  global_secondary_index {
    name            = "EmployeeIndex"
    hash_key        = "employeeId"
    projection_type = "ALL"
  }

  tags = {
    Name = "ExpenseApprovals"
  }
}
