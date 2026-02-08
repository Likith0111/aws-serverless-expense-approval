# =============================================================================
# Terraform configuration and AWS provider
# =============================================================================
#
# This is the root configuration for the Expense Approval Workflow.
# Resources are organized across separate files by AWS service:
#   - lambda.tf          Lambda functions + deployment package
#   - api_gateway.tf     HTTP API Gateway
#   - step_functions.tf  Step Functions state machine
#   - dynamodb.tf        DynamoDB table
#   - iam.tf             IAM roles and least-privilege policies
#   - variables.tf       Input variables
#   - outputs.tf         Stack outputs

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # For production, configure a remote backend (e.g. S3 + DynamoDB).
  # For local demo usage, the default local backend is sufficient.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ExpenseApprovalWorkflow"
      ManagedBy   = "Terraform"
      Environment = var.environment
    }
  }
}
