#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EventsApiStack } from "../lib/events-api-stack";

const app = new cdk.App();

new EventsApiStack(app, "EventsApiStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: "Events API - Tech Test Backend",
});

app.synth();
