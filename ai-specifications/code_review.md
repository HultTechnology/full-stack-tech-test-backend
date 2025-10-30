# Code Review Summary - Events API

**Review Date:** 2025-10-30
**Status:** ⚠️ NOT PRODUCTION-READY

## Executive Summary

This Events API demonstrates solid architectural understanding with good separation of concerns and proper use of serverless patterns. However, there are **critical security vulnerabilities** and **data integrity issues** that must be addressed before production deployment.

**Estimated effort to production-ready:** 2-3 weeks

---

## Critical Issues (Must Fix Before Production)

### 1. **Race Condition: Duplicate Registrations** 🔴
**Location:** `src/handlers/events.ts:159-167`, `src/services/dynamodb.ts:220-232`

**Problem:** Time gap between duplicate check and registration creation allows concurrent requests to create duplicates.

**Impact:** Users can register multiple times simultaneously.

**Fix:** Use DynamoDB transactions with conditional expressions.

### 2. **Non-Atomic Capacity Updates** 🔴
**Location:** `src/services/dynamodb.ts:187-232`

**Problem:** Capacity update and registration creation are separate operations. If registration fails, capacity is already incremented.

**Impact:** Event capacity becomes incorrect, overselling or underselling.

**Fix:** Use `TransactWriteItems` for atomic operations.

### 3. **No Authentication/Authorization** 🔴
**Location:** `lib/events-api-stack.ts:71-72`

**Problem:** Only API key authentication. No user identity or permissions model.

**Impact:**
- Anyone with API key can register any email
- No way to revoke access per user
- No ownership model for registrations

**Fix:** Implement AWS Cognito or JWT-based authentication.

### 4. **CORS Allows All Origins** 🔴
**Location:** `lib/events-api-stack.ts:74-78`

```typescript
allowOrigins: apigateway.Cors.ALL_ORIGINS,  // ❌ Security risk
```

**Impact:** Any website can call your API, potential for abuse.

**Fix:** Restrict to specific domains.

### 5. **Inefficient Database Queries (SCAN)** 🔴
**Location:** `src/services/dynamodb.ts:56-68`

**Problem:** Using SCAN to list all events reads entire table.

**Impact:**
- Cost increases with table size
- Poor performance at scale
- Wasted read capacity

**Fix:** Add GSI with `entityType` as partition key.

### 6. **No Tests** 🔴
**Location:** Entire codebase

**Problem:** Zero unit, integration, or contract tests.

**Impact:** No confidence in code changes, high risk of regressions.

**Fix:** Add comprehensive test suite covering race conditions, validation, and error cases.

### 7. **No Monitoring/Alerting** 🔴
**Location:** `lib/events-api-stack.ts`

**Problem:** No CloudWatch alarms for errors, latency, or throttling.

**Impact:** Team won't know when system is failing.

**Fix:** Add CloudWatch alarms and dashboards.

### 8. **Weak Input Validation** 🔴
**Location:** `src/handlers/events.ts:35-38, 120-150`

**Problems:**
- Email regex accepts invalid emails
- No max group size (can register 999,999,999)
- No string length limits
- Event ID not validated

**Impact:** Data quality issues, potential DoS, database errors.

**Fix:** Implement comprehensive validation.

### 9. **No Backup Strategy** 🔴
**Location:** `lib/events-api-stack.ts:24`

```typescript
removalPolicy: cdk.RemovalPolicy.DESTROY,  // ❌ Dangerous for production
```

**Problem:** No point-in-time recovery, table deleted on stack destroy.

**Impact:** Data loss with no recovery.

**Fix:** Enable PITR, use `RETAIN` for production.

### 10. **Pagination Token Security** 🔴
**Location:** `src/services/dynamodb.ts:63-65`

**Problem:** Base64-encoded DynamoDB keys expose internal structure.

**Impact:** Clients can craft arbitrary tokens to access unauthorized data.

**Fix:** Encrypt or sign pagination tokens.

---

## Medium Priority Issues

### 11. **Hardcoded Resource Names**
Makes multi-environment deployment impossible.

### 12. **No Structured Logging**
Hard to parse and analyze logs.

### 13. **PII in Logs**
Attendee emails/names in error logs violates privacy regulations.

### 14. **No GSI for Email Lookups**
Can't efficiently find all registrations for a user (GDPR compliance issue).

### 15. **Client-Side Filtering**
Over-fetches data and filters in Lambda (inefficient).

### 16. **No Retry Logic**
Transient failures not handled.

### 17. **No Cost Monitoring**
Could lead to surprise AWS bills.

### 18. **Email Not Normalized**
Case-sensitive duplicate check allows `user@example.com` and `User@Example.com`.

### 19. **No Environment Separation**
Only production environment, testing happens in prod.

### 20. **Lambda Timeout Too Long**
30 seconds hides performance problems, should be 5-10s.

---

## What's Implemented Well ✅

1. **Optimistic Locking** - Proper use of conditional updates to prevent race conditions in capacity management
2. **Clean Architecture** - Good separation: handlers → services → data
3. **Least Privilege IAM** - Read-only for list/get, read-write only for register
4. **TypeScript Strict Mode** - Good type safety
5. **API Gateway Throttling** - Rate limiting configured (100 req/s)
6. **Consistent Error Format** - Machine-readable error codes
7. **Comprehensive Documentation** - Excellent README and OpenAPI spec

---

## Security Vulnerabilities Summary

| Severity | Count | Examples |
|----------|-------|----------|
| Critical | 10 | CORS, No auth, Race conditions, SCAN, Input validation |
| High | 5 | PII in logs, No backup, Pagination tokens, API key management |
| Medium | 8 | Hardcoded names, No encryption, Cost monitoring |

---

## Recommended Fixes by Priority

### Phase 1: Security (Week 1)
1. Fix CORS configuration
2. Add input validation and limits
3. Implement proper authentication
4. Add request rate limiting per user
5. Encrypt pagination tokens

### Phase 2: Data Integrity (Week 1-2)
6. Implement DynamoDB transactions for registration
7. Add GSI for efficient queries
8. Normalize email addresses
9. Enable point-in-time recovery
10. Add comprehensive tests

### Phase 3: Operations (Week 2-3)
11. Set up CloudWatch alarms
12. Implement structured logging
13. Add X-Ray tracing
14. Create CloudWatch dashboard
15. Set up CI/CD pipeline
16. Add environment separation (dev/staging/prod)

---

## Testing Strategy (Currently Missing)

**Required Tests:**

1. **Unit Tests**
   - Email validation
   - Error response formatting
   - Capacity calculations

2. **Integration Tests**
   - End-to-end registration flow
   - Duplicate registration prevention
   - Capacity edge cases

3. **Concurrency Tests**
   - Multiple simultaneous registrations
   - Race condition scenarios
   - Last spot registration conflicts

4. **Performance Tests**
   - API latency under load
   - DynamoDB query performance
   - Pagination with large datasets

---

## Code Examples for Critical Fixes

### Fix #1: Use Transactions for Registration

```typescript
import { TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";

const transactCommand = new TransactWriteItemsCommand({
  TransactItems: [
    {
      Update: {
        TableName: TABLE_NAME,
        Key: marshall({ PK: `EVENT#${eventId}`, SK: "METADATA" }),
        UpdateExpression: "SET #capacity.#registered = :newRegistered",
        ConditionExpression: "#capacity.#registered = :currentRegistered",
        ExpressionAttributeNames: {
          "#capacity": "capacity",
          "#registered": "registered",
        },
        ExpressionAttributeValues: marshall({
          ":newRegistered": newRegistered,
          ":currentRegistered": event.capacity.registered,
        }),
      },
    },
    {
      Put: {
        TableName: TABLE_NAME,
        Item: marshall({
          PK: `EVENT#${eventId}`,
          SK: `REGISTRATION#${registrationId}`,
          attendeeEmail: attendeeEmail.toLowerCase(),
          attendeeName,
          groupSize,
          registeredAt,
        }),
        ConditionExpression: "attribute_not_exists(PK)",
      },
    },
  ],
});

await client.send(transactCommand);
```

### Fix #2: Restrict CORS

```typescript
defaultCorsPreflightOptions: {
  allowOrigins: [
    "https://yourdomain.com",
    "https://www.yourdomain.com",
  ],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "X-Api-Key", "Authorization"],
  maxAge: cdk.Duration.hours(1),
}
```

### Fix #3: Add GSI for Efficient Queries

```typescript
// In CDK stack
table.addGlobalSecondaryIndex({
  indexName: "EntityTypeIndex",
  partitionKey: { name: "entityType", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "date", type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

// In code
const command = new QueryCommand({
  TableName: TABLE_NAME,
  IndexName: "EntityTypeIndex",
  KeyConditionExpression: "entityType = :type",
  ExpressionAttributeValues: marshall({ ":type": "EVENT" }),
  Limit: limit,
});
```

### Fix #4: Proper Input Validation

```typescript
function validateRegistrationInput(
  attendeeEmail: string,
  attendeeName: string,
  groupSize: number
): { valid: boolean; error?: string } {
  // Email validation
  if (!attendeeEmail || attendeeEmail.length > 254) {
    return { valid: false, error: "Invalid email length" };
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(attendeeEmail)) {
    return { valid: false, error: "Invalid email format" };
  }

  // Name validation
  if (!attendeeName || attendeeName.length < 1 || attendeeName.length > 100) {
    return { valid: false, error: "Name must be 1-100 characters" };
  }

  // Group size validation
  if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 10) {
    return { valid: false, error: "Group size must be 1-10" };
  }

  return { valid: true };
}
```

---

## Cost Analysis

**Current Usage Pattern (10k req/day):**
- Lambda: 300k requests/month (30% of free tier)
- DynamoDB: SCAN operations expensive at scale
- API Gateway: 300k requests/month (15% of free tier)

**Recommendations:**
- Switch to Query (GSI) to reduce DynamoDB costs
- Consider caching for frequently accessed events
- Monitor actual usage vs. free tier limits

---

## Production Readiness Checklist

- [ ] Fix all critical security vulnerabilities
- [ ] Implement DynamoDB transactions
- [ ] Add comprehensive test suite (>80% coverage)
- [ ] Set up CloudWatch alarms and dashboard
- [ ] Enable point-in-time recovery
- [ ] Implement proper authentication (Cognito/JWT)
- [ ] Add environment separation (dev/staging/prod)
- [ ] Set up CI/CD pipeline
- [ ] Document rollback procedures
- [ ] Add X-Ray tracing
- [ ] Implement structured logging
- [ ] Create runbook for common issues
- [ ] Perform load testing
- [ ] Security audit/penetration testing
- [ ] GDPR compliance review (if applicable)

---

## Conclusion

The codebase demonstrates good architectural patterns and shows understanding of serverless best practices. The optimistic locking implementation is particularly well done. However, critical security and data integrity issues prevent production deployment.

**Recommendation:** Address all critical issues before considering production use. This is suitable for a technical test or proof-of-concept, but requires significant work for production.
