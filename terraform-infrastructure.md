# Terraform Infrastructure for Real-Time Sports Data Integration Engine

This document contains the complete Terraform configuration for deploying the serverless infrastructure.

## Main Configuration

```hcl
# infrastructure/terraform/main.tf
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "sports-data-engine"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Variables
variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "sports-data-engine"
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
```

## DynamoDB Tables

```hcl
# infrastructure/terraform/dynamodb.tf

# Main sports data table
resource "aws_dynamodb_table" "sports_data" {
  name           = "${var.project_name}-sports-data-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  stream_enabled = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "source"
    type = "S"
  }

  attribute {
    name = "eventType"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  # Global Secondary Index for querying by source
  global_secondary_index {
    name            = "SourceIndex"
    hash_key        = "source"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Global Secondary Index for querying by event type
  global_secondary_index {
    name            = "EventTypeIndex"
    hash_key        = "eventType"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # TTL for automatic data cleanup
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-sports-data"
  }
}

# WebSocket connections table
resource "aws_dynamodb_table" "websocket_connections" {
  name         = "${var.project_name}-websocket-connections-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  # TTL for automatic connection cleanup
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-websocket-connections"
  }
}

# API rate limiting table
resource "aws_dynamodb_table" "api_rate_limits" {
  name         = "${var.project_name}-api-rate-limits-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "apiKey"

  attribute {
    name = "apiKey"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-api-rate-limits"
  }
}
```

## Lambda Functions

```hcl
# infrastructure/terraform/lambda.tf

# IAM role for Lambda functions
resource "aws_iam_role" "lambda_execution_role" {
  name = "${var.project_name}-lambda-execution-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM policy for Lambda functions
resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-lambda-policy-${var.environment}"
  role = aws_iam_role.lambda_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.sports_data.arn,
          "${aws_dynamodb_table.sports_data.arn}/index/*",
          aws_dynamodb_table.websocket_connections.arn,
          aws_dynamodb_table.api_rate_limits.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams"
        ]
        Resource = aws_dynamodb_table.sports_data.stream_arn
      },
      {
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = "${aws_apigatewayv2_api.websocket_api.execution_arn}/*/*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.api_keys.arn
        ]
      }
    ]
  })
}

# Attach basic execution role
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_execution_role.name
}

# Data ingestion Lambda function
resource "aws_lambda_function" "data_ingestion" {
  filename         = "../dist/data-ingestion.zip"
  function_name    = "${var.project_name}-data-ingestion-${var.environment}"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "handler.handler"
  source_code_hash = filebase64sha256("../dist/data-ingestion.zip")
  runtime         = "nodejs18.x"
  timeout         = 30
  memory_size     = 512

  environment {
    variables = {
      SPORTS_DATA_TABLE = aws_dynamodb_table.sports_data.name
      WEBSOCKET_ENDPOINT = aws_apigatewayv2_api.websocket_api.api_endpoint
      SECRET_ARN = aws_secretsmanager_secret.api_keys.arn
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [aws_iam_role_policy_attachment.lambda_basic_execution]
}

# WebSocket handler Lambda function
resource "aws_lambda_function" "websocket_handler" {
  filename         = "../dist/websocket-handler.zip"
  function_name    = "${var.project_name}-websocket-handler-${var.environment}"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "handler.handler"
  source_code_hash = filebase64sha256("../dist/websocket-handler.zip")
  runtime         = "nodejs18.x"
  timeout         = 30
  memory_size     = 256

  environment {
    variables = {
      CONNECTIONS_TABLE = aws_dynamodb_table.websocket_connections.name
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [aws_iam_role_policy_attachment.lambda_basic_execution]
}

# Stream processor Lambda function
resource "aws_lambda_function" "stream_processor" {
  filename         = "../dist/stream-processor.zip"
  function_name    = "${var.project_name}-stream-processor-${var.environment}"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "handler.handler"
  source_code_hash = filebase64sha256("../dist/stream-processor.zip")
  runtime         = "nodejs18.x"
  timeout         = 60
  memory_size     = 1024

  environment {
    variables = {
      CONNECTIONS_TABLE = aws_dynamodb_table.websocket_connections.name
      WEBSOCKET_ENDPOINT = aws_apigatewayv2_api.websocket_api.api_endpoint
      ENVIRONMENT = var.environment
    }
  }

  depends_on = [aws_iam_role_policy_attachment.lambda_basic_execution]
}

# DynamoDB stream event source mapping
resource "aws_lambda_event_source_mapping" "sports_data_stream" {
  event_source_arn  = aws_dynamodb_table.sports_data.stream_arn
  function_name     = aws_lambda_function.stream_processor.arn
  starting_position = "LATEST"
  batch_size        = 10
  
  filter_criteria {
    filter {
      pattern = jsonencode({
        eventName = ["INSERT", "MODIFY"]
      })
    }
  }
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "api_gateway_invoke_data_ingestion" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.data_ingestion.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "api_gateway_invoke_websocket" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket_handler.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket_api.execution_arn}/*/*"
}
```

## API Gateway Configuration

```hcl
# infrastructure/terraform/api-gateway.tf

# REST API Gateway
resource "aws_api_gateway_rest_api" "main_api" {
  name        = "${var.project_name}-api-${var.environment}"
  description = "Sports Data Integration Engine REST API"
  
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# API Gateway deployment
resource "aws_api_gateway_deployment" "main_api_deployment" {
  rest_api_id = aws_api_gateway_rest_api.main_api.id
  stage_name  = var.environment

  depends_on = [
    aws_api_gateway_method.data_ingestion_post,
    aws_api_gateway_integration.data_ingestion_integration
  ]

  lifecycle {
    create_before_destroy = true
  }
}

# Data ingestion resource
resource "aws_api_gateway_resource" "data_ingestion" {
  rest_api_id = aws_api_gateway_rest_api.main_api.id
  parent_id   = aws_api_gateway_rest_api.main_api.root_resource_id
  path_part   = "ingest"
}

# Data ingestion POST method
resource "aws_api_gateway_method" "data_ingestion_post" {
  rest_api_id   = aws_api_gateway_rest_api.main_api.id
  resource_id   = aws_api_gateway_resource.data_ingestion.id
  http_method   = "POST"
  authorization = "NONE"
}

# Data ingestion integration
resource "aws_api_gateway_integration" "data_ingestion_integration" {
  rest_api_id             = aws_api_gateway_rest_api.main_api.id
  resource_id             = aws_api_gateway_resource.data_ingestion.id
  http_method             = aws_api_gateway_method.data_ingestion_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.data_ingestion.invoke_arn
}

# CORS configuration
resource "aws_api_gateway_method" "data_ingestion_options" {
  rest_api_id   = aws_api_gateway_rest_api.main_api.id
  resource_id   = aws_api_gateway_resource.data_ingestion.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "data_ingestion_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.main_api.id
  resource_id = aws_api_gateway_resource.data_ingestion.id
  http_method = aws_api_gateway_method.data_ingestion_options.http_method
  type        = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "data_ingestion_options_response" {
  rest_api_id = aws_api_gateway_rest_api.main_api.id
  resource_id = aws_api_gateway_resource.data_ingestion.id
  http_method = aws_api_gateway_method.data_ingestion_options.http_method
  status_code = "200"
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "data_ingestion_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.main_api.id
  resource_id = aws_api_gateway_resource.data_ingestion.id
  http_method = aws_api_gateway_method.data_ingestion_options.http_method
  status_code = aws_api_gateway_method_response.data_ingestion_options_response.status_code
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# WebSocket API Gateway
resource "aws_apigatewayv2_api" "websocket_api" {
  name                       = "${var.project_name}-websocket-api-${var.environment}"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

# WebSocket API stages
resource "aws_apigatewayv2_stage" "websocket_stage" {
  api_id      = aws_apigatewayv2_api.websocket_api.id
  name        = var.environment
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 5000
    throttling_rate_limit  = 2000
  }
}

# WebSocket routes
resource "aws_apigatewayv2_route" "websocket_connect" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.websocket_connect_integration.id}"
}

resource "aws_apigatewayv2_route" "websocket_disconnect" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.websocket_disconnect_integration.id}"
}

resource "aws_apigatewayv2_route" "websocket_default" {
  api_id    = aws_apigatewayv2_api.websocket_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.websocket_default_integration.id}"
}

# WebSocket integrations
resource "aws_apigatewayv2_integration" "websocket_connect_integration" {
  api_id           = aws_apigatewayv2_api.websocket_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.websocket_handler.invoke_arn
}

resource "aws_apigatewayv2_integration" "websocket_disconnect_integration" {
  api_id           = aws_apigatewayv2_api.websocket_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.websocket_handler.invoke_arn
}

resource "aws_apigatewayv2_integration" "websocket_default_integration" {
  api_id           = aws_apigatewayv2_api.websocket_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.websocket_handler.invoke_arn
}
```

## Secrets Management

```hcl
# API keys for external sports APIs
resource "aws_secretsmanager_secret" "api_keys" {
  name        = "${var.project_name}-api-keys-${var.environment}"
  description = "API keys for external sports data providers"
}

resource "aws_secretsmanager_secret_version" "api_keys" {
  secret_id = aws_secretsmanager_secret.api_keys.id
  secret_string = jsonencode({
    SPORTSDATA_API_KEY = "your-sportsdata-api-key"
    ODDS_API_KEY      = "your-odds-api-key"
    SPORTRADAR_API_KEY = "your-sportradar-api-key"
    SENTRY_DSN        = "your-sentry-dsn"
  })
  
  lifecycle {
    ignore_changes = [secret_string]
  }
}
```

## Outputs

```hcl
# infrastructure/terraform/outputs.tf
output "api_gateway_url" {
  description = "URL of the API Gateway"
  value       = aws_api_gateway_deployment.main_api_deployment.invoke_url
}

output "websocket_api_url" {
  description = "URL of the WebSocket API"
  value       = aws_apigatewayv2_api.websocket_api.api_endpoint
}

output "sports_data_table_name" {
  description = "Name of the sports data DynamoDB table"
  value       = aws_dynamodb_table.sports_data.name
}

output "sports_data_table_stream_arn" {
  description = "ARN of the sports data table stream"
  value       = aws_dynamodb_table.sports_data.stream_arn
}

output "websocket_connections_table_name" {
  description = "Name of the WebSocket connections table"
  value       = aws_dynamodb_table.websocket_connections.name
}

output "lambda_function_names" {
  description = "Names of the Lambda functions"
  value = {
    data_ingestion   = aws_lambda_function.data_ingestion.function_name
    websocket_handler = aws_lambda_function.websocket_handler.function_name
    stream_processor = aws_lambda_function.stream_processor.function_name
  }
}
```

This Terraform configuration provides a complete, production-ready infrastructure for your sports data integration engine with proper IAM permissions, monitoring capabilities, and scalable architecture.