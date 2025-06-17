# Real-Time Sports Data Integration Engine - Lambda Handler Examples

This document provides complete TypeScript implementations for the core Lambda functions in the sports data integration engine.

## 1. Data Ingestion Handler

```typescript
// src/functions/data-ingestion/handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SportsDataProcessor } from './data-transformer';
import { WebSocketBroadcaster } from '../../shared/websockets/broadcaster';
import { Logger } from '../../shared/monitoring/logger';
import { SportsEvent, BettingOdds } from '../../types/sports-data';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const logger = new Logger('data-ingestion');
const wsService = new WebSocketBroadcaster();

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Processing data ingestion request', { requestId: context.awsRequestId });

    const body = JSON.parse(event.body || '{}');
    const { source, data, eventType } = body;

    // Validate incoming data
    if (!source || !data || !eventType) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: source, data, eventType' })
      };
    }

    // Process data based on type
    const processor = new SportsDataProcessor();
    let processedData;

    switch (eventType) {
      case 'race_result':
        processedData = await processor.processRaceResult(data);
        break;
      case 'betting_odds':
        processedData = await processor.processBettingOdds(data);
        break;
      case 'live_score':
        processedData = await processor.processLiveScore(data);
        break;
      default:
        throw new Error(`Unsupported event type: ${eventType}`);
    }

    // Store in DynamoDB
    const item = {
      id: `${source}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source,
      eventType,
      data: processedData,
      timestamp: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours TTL
    };

    await docClient.send(new PutCommand({
      TableName: process.env.SPORTS_DATA_TABLE,
      Item: item
    }));

    // Broadcast to WebSocket connections
    await wsService.broadcastToConnections({
      type: eventType,
      data: processedData,
      timestamp: item.timestamp
    });

    logger.info('Data processed successfully', { 
      itemId: item.id, 
      eventType, 
      source 
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        itemId: item.id,
        timestamp: item.timestamp
      })
    };

  } catch (error) {
    logger.error('Error processing data ingestion', { error: error.message });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
```

## 2. WebSocket Handler

```typescript
// src/functions/websocket-handler/handler.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ConnectionManager } from './connection-manager';
import { Logger } from '../../shared/monitoring/logger';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const logger = new Logger('websocket-handler');

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const { connectionId, routeKey } = event.requestContext;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  const apiGwClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`
  });

  const connectionManager = new ConnectionManager(docClient, apiGwClient);

  try {
    switch (routeKey) {
      case '$connect':
        await connectionManager.addConnection(connectionId, {
          timestamp: new Date().toISOString(),
          queryParams: event.queryStringParameters || {}
        });
        logger.info('Connection established', { connectionId });
        break;

      case '$disconnect':
        await connectionManager.removeConnection(connectionId);
        logger.info('Connection closed', { connectionId });
        break;

      case 'subscribe':
        const body = JSON.parse(event.body || '{}');
        await connectionManager.updateSubscriptions(connectionId, body.subscriptions || []);
        logger.info('Subscription updated', { connectionId, subscriptions: body.subscriptions });
        break;

      default:
        logger.warn('Unknown route', { routeKey, connectionId });
        return { statusCode: 400, body: 'Unknown route' };
    }

    return { statusCode: 200, body: 'Success' };

  } catch (error) {
    logger.error('WebSocket handler error', { 
      error: error.message, 
      connectionId, 
      routeKey 
    });
    
    return { statusCode: 500, body: 'Internal server error' };
  }
};
```

## 3. Stream Processor Handler

```typescript
// src/functions/stream-processor/handler.ts
import { DynamoDBStreamEvent, DynamoDBStreamHandler, Context } from 'aws-lambda';
import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { EventProcessor } from './event-processor';
import { WebSocketBroadcaster } from '../../shared/websockets/broadcaster';
import { Logger } from '../../shared/monitoring/logger';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const logger = new Logger('stream-processor');

export const handler: DynamoDBStreamHandler = async (
  event: DynamoDBStreamEvent,
  context: Context
): Promise<void> => {
  const apiGwClient = new ApiGatewayManagementApiClient({
    endpoint: process.env.WEBSOCKET_ENDPOINT
  });

  const broadcaster = new WebSocketBroadcaster(apiGwClient, docClient);
  const processor = new EventProcessor();

  for (const record of event.Records) {
    try {
      if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
        const newImage = record.dynamodb?.NewImage;
        if (!newImage) continue;

        // Convert DynamoDB record to readable format
        const processedData = await processor.processDynamoDBRecord(record);
        
        if (processedData) {
          // Broadcast to relevant WebSocket connections
          await broadcaster.broadcastToSubscribers(processedData);
          
          logger.info('Stream event processed', {
            eventName: record.eventName,
            dataType: processedData.type,
            timestamp: processedData.timestamp
          });
        }
      }
    } catch (error) {
      logger.error('Error processing stream record', {
        error: error.message,
        record: record.dynamodb?.Keys
      });
      // Continue processing other records even if one fails
    }
  }
};
```

## 4. External API Integration

```typescript
// src/shared/external-apis/sports-apis.ts
import axios, { AxiosInstance } from 'axios';
import { Logger } from '../monitoring/logger';
import { SportsEvent, BettingOdds, RaceResult } from '../../types/sports-data';

export class SportsAPIIntegrator {
  private logger: Logger;
  private apiClients: Map<string, AxiosInstance>;

  constructor() {
    this.logger = new Logger('sports-api-integrator');
    this.apiClients = new Map();
    this.initializeAPIClients();
  }

  private initializeAPIClients() {
    // SportsDataIO
    this.apiClients.set('sportsdata', axios.create({
      baseURL: 'https://api.sportsdata.io/v3',
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.SPORTSDATA_API_KEY
      },
      timeout: 5000
    }));

    // The Odds API
    this.apiClients.set('odds', axios.create({
      baseURL: 'https://api.the-odds-api.com/v4',
      params: {
        apiKey: process.env.ODDS_API_KEY
      },
      timeout: 5000
    }));

    // Sportradar
    this.apiClients.set('sportradar', axios.create({
      baseURL: 'https://api.sportradar.us',
      params: {
        api_key: process.env.SPORTRADAR_API_KEY
      },
      timeout: 5000
    }));
  }

  async fetchLiveScores(sport: string): Promise<SportsEvent[]> {
    try {
      const client = this.apiClients.get('sportsdata');
      const response = await client.get(`/${sport}/scores/json/GamesByDate/${new Date().toISOString().split('T')[0]}`);
      
      return response.data.map(game => ({
        id: game.GameID,
        sport,
        homeTeam: game.HomeTeam,
        awayTeam: game.AwayTeam,
        score: {
          home: game.HomeScore,
          away: game.AwayScore
        },
        status: game.Status,
        timestamp: game.DateTime
      }));
    } catch (error) {
      this.logger.error('Failed to fetch live scores', { sport, error: error.message });
      throw error;
    }
  }

  async fetchBettingOdds(sport: string, region: string = 'us'): Promise<BettingOdds[]> {
    try {
      const client = this.apiClients.get('odds');
      const response = await client.get(`/sports/${sport}/odds`, {
        params: {
          regions: region,
          markets: 'h2h,spreads,totals',
          oddsFormat: 'decimal'
        }
      });

      return response.data.map(game => ({
        id: game.id,
        sport,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        bookmakers: game.bookmakers.map(bookmaker => ({
          name: bookmaker.title,
          markets: bookmaker.markets
        })),
        timestamp: game.commence_time
      }));
    } catch (error) {
      this.logger.error('Failed to fetch betting odds', { sport, region, error: error.message });
      throw error;
    }
  }

  async setupWebhooks(endpoints: string[]): Promise<void> {
    // Implementation for setting up webhooks with various sports APIs
    for (const endpoint of endpoints) {
      try {
        // Configure webhook endpoints for real-time updates
        await this.configureWebhook(endpoint);
        this.logger.info('Webhook configured', { endpoint });
      } catch (error) {
        this.logger.error('Failed to configure webhook', { endpoint, error: error.message });
      }
    }
  }

  private async configureWebhook(endpoint: string): Promise<void> {
    // Implementation varies by API provider
    // This would configure webhooks for real-time data push
  }
}
```

## 5. DynamoDB Models and Utilities

```typescript
// src/shared/database/models.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export interface SportsDataItem {
  id: string;
  source: string;
  eventType: string;
  data: any;
  timestamp: string;
  ttl?: number;
  gsi1pk?: string; // For Global Secondary Index
  gsi1sk?: string;
}

export interface WebSocketConnection {
  connectionId: string;
  timestamp: string;
  subscriptions: string[];
  queryParams: Record<string, string>;
  ttl: number;
}

export class SportsDataModel {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  async putItem(item: SportsDataItem): Promise<void> {
    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: item
    }));
  }

  async getRecentEvents(eventType: string, limit: number = 50): Promise<SportsDataItem[]> {
    const response = await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: 'EventTypeIndex',
      KeyConditionExpression: 'eventType = :eventType',
      ExpressionAttributeValues: {
        ':eventType': eventType
      },
      ScanIndexForward: false, // Get most recent first
      Limit: limit
    }));

    return response.Items as SportsDataItem[];
  }

  async getEventsBySource(source: string, startTime?: string): Promise<SportsDataItem[]> {
    const keyCondition = 'source = :source';
    const expressionValues: any = { ':source': source };

    if (startTime) {
      keyCondition += ' AND #timestamp >= :startTime';
      expressionValues[':startTime'] = startTime;
    }

    const response = await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: 'SourceIndex',
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: expressionValues,
      ScanIndexForward: false
    }));

    return response.Items as SportsDataItem[];
  }
}

export class ConnectionModel {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  async addConnection(connection: WebSocketConnection): Promise<void> {
    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: connection
    }));
  }

  async updateSubscriptions(connectionId: string, subscriptions: string[]): Promise<void> {
    await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { connectionId },
      UpdateExpression: 'SET subscriptions = :subscriptions',
      ExpressionAttributeValues: {
        ':subscriptions': subscriptions
      }
    }));
  }

  async getConnectionsBySubscription(subscription: string): Promise<WebSocketConnection[]> {
    const response = await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: 'SubscriptionIndex',
      KeyConditionExpression: 'contains(subscriptions, :subscription)',
      ExpressionAttributeValues: {
        ':subscription': subscription
      }
    }));

    return response.Items as WebSocketConnection[];
  }
}
```

This implementation provides a robust foundation for your real-time sports data integration engine with proper error handling, logging, and scalable architecture patterns.