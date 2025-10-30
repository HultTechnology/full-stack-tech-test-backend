import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import * as path from "path";

export class EventsApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table
    const table = new dynamodb.Table(this, "EventsTable", {
      tableName: "events-table",
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test purposes
    });

    // Lambda function configuration
    const lambdaEnvironment = {
      EVENTS_TABLE_NAME: table.tableName,
    };

    const lambdaProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      environment: lambdaEnvironment,
      code: lambda.Code.fromAsset(path.join(__dirname, "../dist")),
    };

    // Lambda Functions
    const listEventsFunction = new lambda.Function(this, "ListEventsFunction", {
      ...lambdaProps,
      handler: "src/handlers/events.listEventsHandler",
      functionName: "events-api-list-events",
    });

    const getEventFunction = new lambda.Function(this, "GetEventFunction", {
      ...lambdaProps,
      handler: "src/handlers/events.getEventHandler",
      functionName: "events-api-get-event",
    });

    const registerEventFunction = new lambda.Function(
      this,
      "RegisterEventFunction",
      {
        ...lambdaProps,
        handler: "src/handlers/events.registerEventHandler",
        functionName: "events-api-register-event",
      }
    );

    // Grant DynamoDB permissions
    table.grantReadData(listEventsFunction);
    table.grantReadData(getEventFunction);
    table.grantReadWriteData(registerEventFunction);

    // API Gateway
    const api = new apigateway.RestApi(this, "EventsApi", {
      restApiName: "Events API",
      description: "API for managing events and registrations",
      deployOptions: {
        stageName: "prod",
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "X-Api-Key"],
      },
    });

    // API Key and Usage Plan
    const apiKey = api.addApiKey("EventsApiKey", {
      apiKeyName: "events-api-key",
    });

    const usagePlan = api.addUsagePlan("EventsUsagePlan", {
      name: "Events API Usage Plan",
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: api.deploymentStage,
    });

    // API Resources and Methods
    const events = api.root.addResource("events");

    // GET /events
    events.addMethod(
      "GET",
      new apigateway.LambdaIntegration(listEventsFunction),
      {
        apiKeyRequired: true,
      }
    );

    // GET /events/{id}
    const eventById = events.addResource("{id}");
    eventById.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getEventFunction),
      {
        apiKeyRequired: true,
      }
    );

    // POST /events/{id}/register
    const register = eventById.addResource("register");
    register.addMethod(
      "POST",
      new apigateway.LambdaIntegration(registerEventFunction),
      {
        apiKeyRequired: true,
      }
    );

    // Stack Outputs
    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "Events API URL",
    });

    new cdk.CfnOutput(this, "ApiKeyId", {
      value: apiKey.keyId,
      description: "API Key ID (retrieve value from AWS Console)",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: table.tableName,
      description: "DynamoDB Table Name",
    });
  }
}
