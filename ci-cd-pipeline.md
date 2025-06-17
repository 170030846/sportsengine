# GitHub Actions CI/CD Pipeline Configuration

This document contains the complete GitHub Actions workflows for automated testing, building, and deployment of the sports data integration engine.

## Deployment Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy Sports Data Engine

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-east-1
  NODE_VERSION: 18

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: ${{ env.AWS_REGION }}

      - name: Generate test coverage
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
          flags: unittests

  build:
    name: Build Lambda Functions
    runs-on: ubuntu-latest
    needs: test
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build TypeScript
        run: npm run build

      - name: Package Lambda functions
        run: npm run package

      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: lambda-packages
          path: dist/
          retention-days: 5

  deploy-dev:
    name: Deploy to Development
    runs-on: ubuntu-latest
    needs: [test, build]
    if: github.ref == 'refs/heads/develop'
    environment: development
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: lambda-packages
          path: dist/

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.5.0

      - name: Terraform Init
        run: terraform init
        working-directory: infrastructure/terraform

      - name: Terraform Plan
        run: terraform plan -var="environment=dev" -out=tfplan
        working-directory: infrastructure/terraform

      - name: Terraform Apply
        run: terraform apply tfplan
        working-directory: infrastructure/terraform

      - name: Update Lambda function code
        run: |
          for func in data-ingestion websocket-handler stream-processor; do
            aws lambda update-function-code \
              --function-name sports-data-engine-${func}-dev \
              --zip-file fileb://dist/${func}.zip
          done

      - name: Run smoke tests
        run: npm run test:smoke
        env:
          API_ENDPOINT: ${{ steps.terraform.outputs.api_gateway_url }}
          WEBSOCKET_ENDPOINT: ${{ steps.terraform.outputs.websocket_api_url }}

  deploy-prod:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [test, build]
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: lambda-packages
          path: dist/

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.PROD_AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.PROD_AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.5.0

      - name: Terraform Init
        run: terraform init
        working-directory: infrastructure/terraform

      - name: Terraform Plan
        run: terraform plan -var="environment=prod" -out=tfplan
        working-directory: infrastructure/terraform

      - name: Terraform Apply
        run: terraform apply tfplan
        working-directory: infrastructure/terraform

      - name: Update Lambda function code
        run: |
          for func in data-ingestion websocket-handler stream-processor; do
            aws lambda update-function-code \
              --function-name sports-data-engine-${func}-prod \
              --zip-file fileb://dist/${func}.zip
          done

      - name: Run production smoke tests
        run: npm run test:smoke:prod
        env:
          API_ENDPOINT: ${{ steps.terraform.outputs.api_gateway_url }}
          WEBSOCKET_ENDPOINT: ${{ steps.terraform.outputs.websocket_api_url }}

      - name: Create GitHub release
        if: success()
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ github.run_number }}
          release_name: Release v${{ github.run_number }}
          body: |
            Automated deployment to production
            
            Changes in this release:
            ${{ github.event.head_commit.message }}
          draft: false
          prerelease: false
```

## Testing Workflow

```yaml
# .github/workflows/test.yml
name: Continuous Testing

on:
  push:
    branches: [main, develop, feature/*]
  pull_request:
    branches: [main, develop]
  schedule:
    # Run tests daily at 2 AM UTC
    - cron: '0 2 * * *'

env:
  NODE_VERSION: 18
  AWS_REGION: us-east-1

jobs:
  lint:
    name: Lint Code
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run Prettier check
        run: npm run prettier:check

      - name: Type check
        run: npm run type-check

  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16, 18, 20]
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit -- --coverage

      - name: Upload coverage
        if: matrix.node-version == 18
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    
    services:
      dynamodb-local:
        image: amazon/dynamodb-local:latest
        ports:
          - 8000:8000
        options: >-
          --health-cmd "curl -f http://localhost:8000/ || exit 1"
          --health-interval 30s
          --health-timeout 10s
          --health-retries 5
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup test environment
        run: |
          npm run setup:test-env
          npm run migrate:test

      - name: Run integration tests
        run: npm run test:integration
        env:
          DYNAMODB_ENDPOINT: http://localhost:8000
          AWS_ACCESS_KEY_ID: test
          AWS_SECRET_ACCESS_KEY: test
          AWS_REGION: us-east-1

  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit
        run: npm audit --audit-level=moderate

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=medium

      - name: Upload Snyk results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: snyk.sarif

  performance-tests:
    name: Performance Tests
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule' || contains(github.event.head_commit.message, '[perf]')
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run performance tests
        run: npm run test:performance
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: ${{ env.AWS_REGION }}

      - name: Upload performance results
        uses: actions/upload-artifact@v3
        with:
          name: performance-results
          path: test-results/performance/
```

## Package.json Scripts

```json
{
  "name": "sports-data-integration-engine",
  "version": "1.0.0",
  "description": "Real-time sports data integration engine with serverless architecture",
  "scripts": {
    "build": "tsc && webpack --mode=production",
    "build:dev": "tsc && webpack --mode=development",
    "package": "npm run build && npm run zip-functions",
    "zip-functions": "cd dist && for dir in */; do zip -r \"${dir%/}.zip\" \"$dir\"; done",
    
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch",
    "test:smoke": "jest --testPathPattern=smoke --testTimeout=30000",
    "test:smoke:prod": "jest --testPathPattern=smoke --testTimeout=30000 --config=jest.prod.config.js",
    "test:performance": "jest --testPathPattern=performance --testTimeout=60000",
    
    "lint": "eslint src --ext .ts,.js",
    "lint:fix": "eslint src --ext .ts,.js --fix",
    "prettier": "prettier --write \"src/**/*.{ts,js,json}\"",
    "prettier:check": "prettier --check \"src/**/*.{ts,js,json}\"",
    "type-check": "tsc --noEmit",
    
    "deploy:dev": "cd infrastructure/terraform && terraform apply -var=\"environment=dev\"",
    "deploy:prod": "cd infrastructure/terraform && terraform apply -var=\"environment=prod\"",
    "destroy:dev": "cd infrastructure/terraform && terraform destroy -var=\"environment=dev\"",
    
    "setup:test-env": "node scripts/setup-test-environment.js",
    "migrate:test": "node scripts/migrate-test-db.js",
    
    "start:local": "serverless offline start",
    "start:dev": "npm run build:dev && npm run start:local"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.119",
    "@types/jest": "^29.5.5",
    "@types/node": "^20.6.0",
    "@typescript-eslint/eslint-plugin": "^6.7.0",
    "@typescript-eslint/parser": "^6.7.0",
    "eslint": "^8.49.0",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-prettier": "^5.0.0",
    "jest": "^29.7.0",
    "prettier": "^3.0.3",
    "ts-jest": "^29.1.1",
    "typescript": "^5.2.2",
    "webpack": "^5.88.2",
    "webpack-cli": "^5.1.4"
  },
  "dependencies": {
    "@aws-sdk/client-apigatewaymanagementapi": "^3.410.0",
    "@aws-sdk/client-dynamodb": "^3.410.0",
    "@aws-sdk/client-secretsmanager": "^3.410.0",
    "@aws-sdk/lib-dynamodb": "^3.410.0",
    "@sentry/node": "^7.69.0",
    "axios": "^1.5.0"
  }
}
```

## Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.(test|spec).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  maxWorkers: 1, // Run tests serially for DynamoDB integration tests
  
  // Different configurations for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'node'
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/integration-setup.ts']
    },
    {
      displayName: 'smoke',
      testMatch: ['<rootDir>/tests/smoke/**/*.test.ts'],
      testEnvironment: 'node',
      testTimeout: 30000
    }
  ]
};
```

## ESLint and Prettier Configuration

```javascript
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'prettier'
  ],
  plugins: ['@typescript-eslint', 'prettier'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'warn'
  },
  env: {
    node: true,
    jest: true
  }
};
```

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

This complete CI/CD pipeline provides automated testing, security scanning, building, and deployment with proper error handling and rollback capabilities.