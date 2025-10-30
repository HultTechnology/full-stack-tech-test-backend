import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  listEvents,
  getEvent,
  registerForEvent,
  checkDuplicateRegistration,
} from "../services/dynamodb";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Api-Key",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function successResponse(data: any): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

function errorResponse(
  statusCode: number,
  error: string,
  message: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error, message }),
  };
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function listEventsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const params = event.queryStringParameters || {};

    const limit = params.limit ? parseInt(params.limit, 10) : undefined;
    if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
      return errorResponse(
        400,
        "INVALID_REQUEST",
        "Limit must be between 1 and 100"
      );
    }

    const result = await listEvents({
      category: params.category,
      search: params.search,
      status: params.status as "available" | "full" | undefined,
      limit,
      lastKey: params.lastKey,
    });

    return successResponse(result);
  } catch (error: any) {
    console.error("Error listing events:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to list events");
  }
}

export async function getEventHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;

    if (!eventId) {
      return errorResponse(400, "INVALID_REQUEST", "Event ID is required");
    }

    const eventData = await getEvent(eventId);

    if (!eventData) {
      return errorResponse(404, "EVENT_NOT_FOUND", "Event not found");
    }

    return successResponse({ event: eventData });
  } catch (error: any) {
    console.error("Error getting event:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to get event");
  }
}

export async function registerEventHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const eventId = event.pathParameters?.id;

    if (!eventId) {
      return errorResponse(400, "INVALID_REQUEST", "Event ID is required");
    }

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return errorResponse(400, "INVALID_REQUEST", "Invalid JSON in request body");
    }

    const { attendeeEmail, attendeeName, groupSize = 1 } = body;

    // Validate required fields
    if (!attendeeEmail || !attendeeName) {
      return errorResponse(
        400,
        "INVALID_REQUEST",
        "Missing required fields: attendeeEmail, attendeeName"
      );
    }

    // Validate email format
    if (!validateEmail(attendeeEmail)) {
      return errorResponse(
        400,
        "INVALID_EMAIL",
        "Please provide a valid email address"
      );
    }

    // Validate attendeeName is non-empty
    if (typeof attendeeName !== "string" || attendeeName.trim().length === 0) {
      return errorResponse(
        400,
        "INVALID_REQUEST",
        "Attendee name must be a non-empty string"
      );
    }

    // Validate groupSize
    if (
      typeof groupSize !== "number" ||
      groupSize < 1 ||
      !Number.isInteger(groupSize)
    ) {
      return errorResponse(
        400,
        "INVALID_REQUEST",
        "Group size must be a positive integer"
      );
    }

    // Check if event exists
    const existingEvent = await getEvent(eventId);
    if (!existingEvent) {
      return errorResponse(404, "EVENT_NOT_FOUND", "Event not found");
    }

    // Check for duplicate registration
    const isDuplicate = await checkDuplicateRegistration(eventId, attendeeEmail);
    if (isDuplicate) {
      return errorResponse(
        400,
        "DUPLICATE_REGISTRATION",
        "This email is already registered for this event"
      );
    }

    // Check if event is already full
    if (existingEvent.capacity.registered >= existingEvent.capacity.max) {
      return errorResponse(
        400,
        "EVENT_FULL",
        "Event has reached maximum capacity"
      );
    }

    // Register for event
    try {
      const result = await registerForEvent(
        eventId,
        attendeeEmail,
        attendeeName,
        groupSize
      );

      return successResponse({
        success: true,
        registrationId: result.registration.registrationId,
        event: result.event,
        attendee: {
          email: result.registration.attendeeEmail,
          name: result.registration.attendeeName,
          groupSize: result.registration.groupSize,
          registeredAt: result.registration.registeredAt,
        },
      });
    } catch (error: any) {
      if (error.message === "INSUFFICIENT_CAPACITY") {
        return errorResponse(
          400,
          "INSUFFICIENT_CAPACITY",
          "Not enough spots available for group size"
        );
      }
      throw error;
    }
  } catch (error: any) {
    console.error("Error registering for event:", error);
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Failed to register for event"
    );
  }
}
