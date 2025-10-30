# **Events API - Implementation Specification**

Build the following minimal API implementation that will be used for a tech test interview. API Keys will be created manually as required.

## **Architecture**

AWS CDK stack with API Gateway + Lambda + DynamoDB

## **CDK Resources**

### **DynamoDB Table**

```typescript
// Single table design
tableName: "events-table";
partitionKey: "PK"(String);
sortKey: "SK"(String);
billingMode: ON_DEMAND;
```

### **Lambda Functions**

```typescript
runtime: nodejs22.x
timeout: 30 seconds
environment: { EVENTS_TABLE_NAME: table.tableName }

functions:
- listEvents: GET /events
- getEvent: GET /events/{id}
- registerEvent: POST /events/{id}/register
```

### **API Gateway**

```typescript
restApi with CORS enabled
apiKeyRequired: true
deploymentStage: 'prod'
usagePlan:
  - throttle: { rateLimit: 100, burstLimit: 200 }
  - quota: { limit: 10000, period: 'DAY' }
```

## **API Endpoints**

### **GET /events**

```javascript
// Query params (all optional):
// - category: string (filters by category.id, exact match)
// - search: string (case-insensitive search in title AND description)
// - status: "available" | "full" (calculated from capacity.registered < capacity.max)
// - limit: number (default: 25, max: 100)
// - lastKey: string (for pagination, encoded PK#SK)

// Response:
{
  events: [...],
  total: number,
  lastKey?: string  // if more results available
}
```

### **GET /events/{id}**

```javascript
// Response: { event: {...} }
// Error: 404 if not found
```

### **POST /events/{id}/register**

```javascript
// Body: { attendeeEmail, attendeeName, groupSize? }
// groupSize defaults to 1 if not provided
// groupSize consumes that many capacity slots

// Validation:
// - Check for duplicate email registration (return 400 if already registered)
// - Validate email format (basic regex)
// - Validate attendeeName is non-empty string
// - Check capacity.registered + groupSize <= capacity.max

// Success: { success: true, registrationId, event, attendee }
// Error responses (see Error Response Format section)
```

## **DynamoDB Schema**

### **Event Record**

```json
{
  "PK": "EVENT#1",
  "SK": "METADATA",
  "title": "React Workshop",
  "description": "Learn React basics",
  "date": "2024-12-15T09:00:00Z",
  "category": { "id": "technology", "name": "Technology", "color": "#3B82F6" },
  "capacity": { "max": 30, "registered": 0 },
  "pricing": { "individual": 50 },
  "status": "available",
  "location": { "type": "physical", "address": "123 Main St" }
}
```

### **Registration Record**

```json
{
  "PK": "EVENT#1",
  "SK": "REGISTRATION#reg_123",
  "attendeeEmail": "user@example.com",
  "attendeeName": "John Doe",
  "groupSize": 1,
  "registeredAt": "2024-12-01T15:30:00Z"
}
```

## **Lambda Implementation**

### **Event Service Functions**

```javascript
// listEvents(queryParams) - scan events, apply filters (category, search, status)
// getEvent(eventId) - get single event with current capacity
// registerForEvent(eventId, attendeeData) - atomic registration with capacity check
//   - Check for duplicate email registration
//   - Validate email format and attendeeName
//   - Use atomic update for capacity.registered += groupSize
```

### **Response Format**

```javascript
// Success: { statusCode: 200, body: JSON.stringify(data) }
// Error: { statusCode: 400/404/500, body: JSON.stringify({ error, message }) }
// Always include CORS headers

// Error Response Format:
{
  error: "ERROR_CODE",        // Machine-readable constant
  message: "Human message"    // User-friendly explanation
}

// Error Codes:
// - EVENT_NOT_FOUND: "Event not found"
// - EVENT_FULL: "Event has reached maximum capacity"
// - DUPLICATE_REGISTRATION: "This email is already registered for this event"
// - INVALID_EMAIL: "Please provide a valid email address"
// - INVALID_REQUEST: "Missing required fields: attendeeEmail, attendeeName"
// - INSUFFICIENT_CAPACITY: "Not enough spots available for group size"
```

## **Sample Data (25 events)**

### **Categories**

```javascript
["technology", "business", "design", "marketing", "health"];
```

### **Event Distribution**

- 15 available events (various capacity)
- 6 nearly full events (1-3 spots left)
- 4 completely full events
- Mix of dates (past, present, future)
- Price range: $0-200
- Location types: physical, online

### **Sample Event Template**

```json
{
  "id": "1",
  "title": "React Fundamentals",
  "description": "Learn React basics in hands-on workshop",
  "date": "2024-12-15T09:00:00Z",
  "category": { "id": "technology", "name": "Technology", "color": "#3B82F6" },
  "capacity": { "max": 30, "registered": 15 },
  "pricing": { "individual": 50 },
  "status": "available",
  "location": { "type": "physical", "address": "123 Tech St, Boston, MA" }
}
```

## **Deployment**

- CDK deploy command
- Output API URL and API key (keys created manually via AWS Console)
- Standalone seed data script to populate 25 sample events
- Basic error handling and logging

## **File Structure**

```
lib/events-api-stack.ts     # CDK resources
src/handlers/events.ts      # Lambda functions
src/services/dynamodb.ts    # DB operations
src/data/seedEvents.ts      # Sample data
scripts/seed.ts             # Standalone script to seed DynamoDB
```
