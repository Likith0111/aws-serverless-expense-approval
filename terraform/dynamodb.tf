# =============================================================================
# DynamoDB table
# =============================================================================
#
# On-demand (PAY_PER_REQUEST) billing eliminates capacity planning and
# ensures zero cost at rest. Free tier includes 25 WCU + 25 RCU always-free.
#
# A Global Secondary Index on employeeId enables efficient queries to
# retrieve all expenses for a given employee without table scans.
#
# Best practices applied:
#   - On-demand billing: zero base cost, pay only for actual reads/writes
#   - GSI with ALL projection: avoids extra GetItem calls after Query
#   - No Scan operations in application code: all access patterns use
#     GetItem (by expenseId) or Query (by employeeId via GSI)
#   - Conditional writes: attribute_not_exists prevents duplicate inserts

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
    Name        = "ExpenseApprovals"
    Project     = "SpendGuard"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# =============================================================================
# Users table for authentication
# =============================================================================
#
# Stores user credentials and role information.
# Email GSI enables efficient login lookups without table scans.
#
# Security:
#   - Passwords stored as bcrypt hashes (never plaintext)
#   - Conditional writes prevent duplicate user creation
#   - On-demand billing for cost efficiency

resource "aws_dynamodb_table" "users" {
  name         = "UsersTable"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "EmailIndex"
    hash_key        = "email"
    projection_type = "ALL"
  }

  tags = {
    Name        = "UsersTable"
    Project     = "SpendGuard"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
