package dynamodb

import (
	"context"
	"fmt"
	"letsgo/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Client wraps DynamoDB operations
type Client struct {
	db     *dynamodb.Client
	config *config.Config
}

// NewClient creates a new DynamoDB client using AWS profile
func NewClient(cfg *config.Config) (*Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion(cfg.AWSRegion),
		awsconfig.WithSharedConfigProfile(cfg.AWSProfile),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	return &Client{
		db:     dynamodb.NewFromConfig(awsCfg),
		config: cfg,
	}, nil
}

// NewClientWithProfile creates a new DynamoDB client using a specific AWS profile
func NewClientWithProfile(cfg *config.Config, profile string) (*Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion(cfg.AWSRegion),
		awsconfig.WithSharedConfigProfile(profile),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config with profile %s: %w", profile, err)
	}

	return &Client{
		db:     dynamodb.NewFromConfig(awsCfg),
		config: cfg,
	}, nil
}

// QueryResult holds the query results
type QueryResult struct {
	Items []map[string]types.AttributeValue
	Count int
}

// GetItem retrieves an item by primary key
func (c *Client) GetItem(ctx context.Context, tableName string, key map[string]types.AttributeValue) (map[string]types.AttributeValue, error) {
	result, err := c.db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(tableName),
		Key:       key,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get item: %w", err)
	}
	return result.Item, nil
}

// Query executes a query on the table or index
func (c *Client) Query(ctx context.Context, tableName string, indexName string, keyCondition string, expressionValues map[string]types.AttributeValue, expressionNames map[string]string) (*QueryResult, error) {
	input := &dynamodb.QueryInput{
		TableName:                 aws.String(tableName),
		KeyConditionExpression:    aws.String(keyCondition),
		ExpressionAttributeValues: expressionValues,
	}

	if indexName != "" {
		input.IndexName = aws.String(indexName)
	}

	if len(expressionNames) > 0 {
		input.ExpressionAttributeNames = expressionNames
	}

	result, err := c.db.Query(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to query: %w", err)
	}

	return &QueryResult{
		Items: result.Items,
		Count: int(result.Count),
	}, nil
}

// PutItem creates or updates an item in the table
func (c *Client) PutItem(ctx context.Context, tableName string, item map[string]types.AttributeValue) error {
	_, err := c.db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(tableName),
		Item:      item,
	})
	if err != nil {
		return fmt.Errorf("failed to put item: %w", err)
	}
	return nil
}

// GetConfig returns the client configuration
func (c *Client) GetConfig() *config.Config {
	return c.config
}

