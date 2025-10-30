# Events API - Backend

A serverless REST API for managing events and registrations, built with AWS CDK, Lambda, API Gateway, and DynamoDB.

## For Technical Test Candidates

You can either:

1. **Use the shared API** - Use the provided API URL and key (quickest option)
2. **Deploy your own instance** - Fork this repo and deploy to your own AWS account
   - Useful if you want to extend the API for bonus features
   - Requires AWS account and credentials configured

## API Documentation

The complete API specification is available in OpenAPI 3.0 format: [openapi.yaml](openapi.yaml)

**Quick Start Options:**

- **Postman Collection**: Import [Tech Test - Full Stack.postman_collection.json](Tech%20Test%20-%20Full%20Stack.postman_collection.json) for ready-to-use API requests
- **Interactive Docs**: View in [Swagger Editor](https://editor.swagger.io/) by pasting [openapi.yaml](openapi.yaml) contents

## Architecture

- **AWS CDK** for infrastructure as code
- **API Gateway** with API key authentication and usage plans
- **AWS Lambda** (Node.js 22.x) for serverless compute
- **DynamoDB** for data storage with single-table design

## Prerequisites

- Node.js 22.x or later
- AWS CLI configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk`)

## Project Structure

```
├── bin/
│   └── app.ts                 # CDK app entry point
├── lib/
│   └── events-api-stack.ts    # CDK stack definition
├── src/
│   ├── handlers/
│   │   └── events.ts          # Lambda handler functions
│   ├── services/
│   │   └── dynamodb.ts        # DynamoDB service layer
│   └── data/
│       └── seedEvents.ts      # Sample event data
├── scripts/
│   └── seed.ts                # Database seeding script
├── cdk.json                   # CDK configuration
├── tsconfig.json              # TypeScript configuration
└── package.json               # Project dependencies
```

## Installation

```bash
npm install
```

## Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

## Deployment

### 1. Bootstrap CDK (first time only)

```bash
cdk bootstrap
```

### 2. Deploy the stack

```bash
npm run deploy
```

This will:

- Create the DynamoDB table
- Deploy Lambda functions
- Set up API Gateway with CORS

### 3. Retrieve API Key

After deployment, get your API key from AWS Console:

1. Go to API Gateway console
2. Navigate to API Keys
3. Click "Create API Key"
4. Click "Show" to reveal the key value
5. Assign the key to the "Events API Usage Plan"

### 4. Seed the database

```bash
npm run seed
```

This will:

- Automatically export your current AWS session credentials
- Populate the database with 25 sample events across 5 categories

**Note**: If using AWS SSO, ensure you have an active session (`aws sso login` if needed).

## API Endpoints

Base URL: `https://<api-id>.execute-api.<region>.amazonaws.com/prod`

All requests require the `x-api-key` header with your API key.

### GET /events

List all events with optional filtering and pagination.

**Query Parameters:**

- `category` (optional): Filter by category ID (e.g., "technology", "business")
- `search` (optional): Search in title and description
- `status` (optional): Filter by "available" or "full"
- `limit` (optional): Number of results (default: 25, max: 100)
- `lastKey` (optional): Pagination token from previous response

**Example:**

```bash
curl -X GET "https://<api-url>/events?category=technology&status=available" \
  -H "x-api-key: <your-api-key>"
```

**Response:**

```json
{
  "events": [...],
  "total": 10,
  "lastKey": "encoded-pagination-token"
}
```

### GET /events/{id}

Get a single event by ID.

**Example:**

```bash
curl -X GET "https://<api-url>/events/1" \
  -H "x-api-key: <your-api-key>"
```

**Response:**

```json
{
  "event": {
    "id": "1",
    "title": "React Fundamentals Workshop",
    "description": "...",
    "date": "2025-01-15T09:00:00Z",
    "category": {...},
    "capacity": {"max": 30, "registered": 15},
    "pricing": {"individual": 50},
    "location": {...}
  }
}
```

### POST /events/{id}/register

Register for an event.

**Body:**

```json
{
  "attendeeEmail": "user@example.com",
  "attendeeName": "John Doe",
  "groupSize": 1
}
```

**Example:**

```bash
curl -X POST "https://<api-url>/events/1/register" \
  -H "x-api-key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "attendeeEmail": "user@example.com",
    "attendeeName": "John Doe",
    "groupSize": 1
  }'
```

**Success Response:**

```json
{
  "success": true,
  "registrationId": "reg_...",
  "event": {...},
  "attendee": {...}
}
```

**Error Response:**

```json
{
  "error": "EVENT_FULL",
  "message": "Event has reached maximum capacity"
}
```

## Error Codes

- `EVENT_NOT_FOUND`: Event does not exist
- `EVENT_FULL`: Event has reached maximum capacity
- `DUPLICATE_REGISTRATION`: Email already registered for this event
- `INVALID_EMAIL`: Invalid email format
- `INVALID_REQUEST`: Missing or invalid request parameters
- `INSUFFICIENT_CAPACITY`: Not enough spots for group size
- `INTERNAL_ERROR`: Server error

## Usage Plan Limits

- Rate limit: 100 requests/second
- Burst limit: 200 requests
- Daily quota: 10,000 requests

## Development

### View CloudFormation template

```bash
npm run synth
```

### Compare local changes with deployed stack

```bash
npm run diff
```

### Destroy the stack

```bash
cdk destroy
```

## Sample Data

The seed script creates 25 events across 5 categories:

- Technology (5 events)
- Business (5 events)
- Design (5 events)
- Marketing (5 events)
- Health & Wellness (5 events)

Events include:

- 15 available events with various capacity levels
- 6 nearly full events (1-3 spots remaining)
- 4 completely full events
- Mix of online and physical locations
- Price range: $0-$2000
- Dates in 2025

## License

ISC
