import {
  DynamoDBClient,
  ScanCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.EVENTS_TABLE_NAME || "events-table";

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  category: {
    id: string;
    name: string;
    color: string;
  };
  capacity: {
    max: number;
    registered: number;
  };
  pricing: {
    individual: number;
  };
  location: {
    type: "physical" | "online";
    address?: string;
  };
}

export interface Registration {
  registrationId: string;
  attendeeEmail: string;
  attendeeName: string;
  groupSize: number;
  registeredAt: string;
}

export interface ListEventsParams {
  category?: string;
  search?: string;
  status?: "available" | "full";
  limit?: number;
  lastKey?: string;
}

export async function listEvents(params: ListEventsParams) {
  const limit = Math.min(params.limit || 25, 100);

  const command = new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: "SK = :metadata",
    ExpressionAttributeValues: marshall({
      ":metadata": "METADATA",
    }),
    Limit: limit * 2, // Over-fetch to account for filtering
    ExclusiveStartKey: params.lastKey
      ? marshall(JSON.parse(Buffer.from(params.lastKey, "base64").toString()))
      : undefined,
  });

  const result = await client.send(command);
  let events: Event[] = (result.Items || []).map((item) => {
    const unmarshalled = unmarshall(item);
    return {
      id: unmarshalled.PK.replace("EVENT#", ""),
      title: unmarshalled.title,
      description: unmarshalled.description,
      date: unmarshalled.date,
      category: unmarshalled.category,
      capacity: unmarshalled.capacity,
      pricing: unmarshalled.pricing,
      location: unmarshalled.location,
    };
  });

  // Apply filters
  if (params.category) {
    events = events.filter((e) => e.category.id === params.category);
  }

  if (params.search) {
    const searchLower = params.search.toLowerCase();
    events = events.filter(
      (e) =>
        e.title.toLowerCase().includes(searchLower) ||
        e.description.toLowerCase().includes(searchLower)
    );
  }

  if (params.status) {
    if (params.status === "available") {
      events = events.filter((e) => e.capacity.registered < e.capacity.max);
    } else if (params.status === "full") {
      events = events.filter((e) => e.capacity.registered >= e.capacity.max);
    }
  }

  // Limit results
  const limitedEvents = events.slice(0, limit);
  const hasMore = events.length > limit || !!result.LastEvaluatedKey;

  return {
    events: limitedEvents,
    total: limitedEvents.length,
    lastKey: hasMore && result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(unmarshall(result.LastEvaluatedKey))).toString("base64")
      : undefined,
  };
}

export async function getEvent(eventId: string): Promise<Event | null> {
  const command = new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: `EVENT#${eventId}`,
      SK: "METADATA",
    }),
  });

  const result = await client.send(command);

  if (!result.Item) {
    return null;
  }

  const unmarshalled = unmarshall(result.Item);
  return {
    id: eventId,
    title: unmarshalled.title,
    description: unmarshalled.description,
    date: unmarshalled.date,
    category: unmarshalled.category,
    capacity: unmarshalled.capacity,
    pricing: unmarshalled.pricing,
    location: unmarshalled.location,
  };
}

export async function checkDuplicateRegistration(
  eventId: string,
  email: string
): Promise<boolean> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    FilterExpression: "attendeeEmail = :email",
    ExpressionAttributeValues: marshall({
      ":pk": `EVENT#${eventId}`,
      ":sk": "REGISTRATION#",
      ":email": email,
    }),
    Limit: 1,
  });

  const result = await client.send(command);
  return (result.Items?.length || 0) > 0;
}

export async function registerForEvent(
  eventId: string,
  attendeeEmail: string,
  attendeeName: string,
  groupSize: number = 1
): Promise<{ registration: Registration; event: Event }> {
  const registrationId = `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const registeredAt = new Date().toISOString();

  // First, get the current event to check capacity
  const event = await getEvent(eventId);
  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  // Check if there's enough capacity
  const newRegistered = event.capacity.registered + groupSize;
  if (newRegistered > event.capacity.max) {
    throw new Error("INSUFFICIENT_CAPACITY");
  }

  // Update event capacity atomically with optimistic locking
  const updateCommand = new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: `EVENT#${eventId}`,
      SK: "METADATA",
    }),
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
    ReturnValues: "ALL_NEW",
  });

  let updatedEvent;
  try {
    const updateResult = await client.send(updateCommand);
    updatedEvent = unmarshall(updateResult.Attributes!);
  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      // Someone else updated the capacity in the meantime
      throw new Error("INSUFFICIENT_CAPACITY");
    }
    throw error;
  }

  // Create registration record
  const registrationCommand = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall({
      PK: `EVENT#${eventId}`,
      SK: `REGISTRATION#${registrationId}`,
      attendeeEmail,
      attendeeName,
      groupSize,
      registeredAt,
    }),
  });

  await client.send(registrationCommand);

  return {
    registration: {
      registrationId,
      attendeeEmail,
      attendeeName,
      groupSize,
      registeredAt,
    },
    event: {
      id: eventId,
      title: updatedEvent.title,
      description: updatedEvent.description,
      date: updatedEvent.date,
      category: updatedEvent.category,
      capacity: updatedEvent.capacity,
      pricing: updatedEvent.pricing,
      location: updatedEvent.location,
    },
  };
}
