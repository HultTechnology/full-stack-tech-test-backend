#!/usr/bin/env ts-node

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { events } from "../src/data/seedEvents";

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const client = new DynamoDBClient({
  region,
  credentials: fromNodeProviderChain()
});
const TABLE_NAME = process.env.TABLE_NAME || "events-table";

console.log(`Using AWS Region: ${region}`);

async function seedEvents() {
  console.log(`Seeding ${events.length} events to table: ${TABLE_NAME}`);

  let successCount = 0;
  let errorCount = 0;

  for (const event of events) {
    try {
      const command = new PutItemCommand({
        TableName: TABLE_NAME,
        Item: marshall({
          PK: `EVENT#${event.id}`,
          SK: "METADATA",
          title: event.title,
          description: event.description,
          date: event.date,
          category: event.category,
          capacity: event.capacity,
          pricing: event.pricing,
          location: event.location,
        }),
      });

      await client.send(command);
      successCount++;
      console.log(`✓ Seeded event ${event.id}: ${event.title}`);
    } catch (error: any) {
      errorCount++;
      console.error(`✗ Failed to seed event ${event.id}:`, error.message);
      console.error(`   Full error:`, JSON.stringify(error, null, 2));
    }
  }

  console.log("\n--- Seed Summary ---");
  console.log(`Total events: ${events.length}`);
  console.log(`Successfully seeded: ${successCount}`);
  console.log(`Failed: ${errorCount}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run the seed function
seedEvents()
  .then(() => {
    console.log("\n✓ Seeding completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Seeding failed:", error);
    process.exit(1);
  });
