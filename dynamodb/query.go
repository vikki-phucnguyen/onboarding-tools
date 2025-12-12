package dynamodb

import (
	"context"
	"fmt"
	"letsgo/config"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// QueryService handles DynamoDB queries based on configuration
type QueryService struct {
	client *Client
}

// NewQueryService creates a new query service
func NewQueryService(client *Client) *QueryService {
	return &QueryService{client: client}
}

// QueryParams holds the parameters for a query
type QueryParams struct {
	Environment config.Environment
	Table       string
	IndexName   string
	Values      map[string]string
}

// ExecuteQuery runs a query based on the provided parameters
func (s *QueryService) ExecuteQuery(ctx context.Context, params QueryParams) ([]map[string]interface{}, error) {
	// Get table config
	tableConfig, ok := s.client.GetConfig().GetTableConfig(params.Environment, params.Table)
	if !ok {
		return nil, fmt.Errorf("table %s not found for environment %s", params.Table, params.Environment)
	}

	// Get index config
	indexConfig, ok := s.client.GetConfig().GetIndexConfig(params.Environment, params.Table, params.IndexName)
	if !ok {
		return nil, fmt.Errorf("index %s not found for table %s", params.IndexName, params.Table)
	}

	// Build key condition and expression values
	keyCondition, expressionValues, err := s.buildKeyCondition(indexConfig, params.Values)
	if err != nil {
		return nil, err
	}

	// If it's a primary key query with no range key, use GetItem for efficiency
	if params.IndexName == "" && indexConfig.RangeKey == "" {
		return s.executeGetItem(ctx, tableConfig.Name, indexConfig.HashKey, params.Values[indexConfig.HashKey])
	}

	// Execute query
	result, err := s.client.Query(ctx, tableConfig.Name, params.IndexName, keyCondition, expressionValues, nil)
	if err != nil {
		return nil, err
	}

	// Convert to map[string]interface{}
	return s.convertItems(result.Items)
}

func (s *QueryService) buildKeyCondition(indexConfig config.IndexConfig, values map[string]string) (string, map[string]types.AttributeValue, error) {
	expressionValues := make(map[string]types.AttributeValue)

	hashValue, ok := values[indexConfig.HashKey]
	if !ok || hashValue == "" {
		return "", nil, fmt.Errorf("hash key %s is required", indexConfig.HashKey)
	}

	keyCondition := fmt.Sprintf("%s = :hashVal", indexConfig.HashKey)
	av, err := attributevalue.Marshal(hashValue)
	if err != nil {
		return "", nil, fmt.Errorf("failed to marshal hash value: %w", err)
	}
	expressionValues[":hashVal"] = av

	// Add range key if provided
	if indexConfig.RangeKey != "" {
		if rangeValue, ok := values[indexConfig.RangeKey]; ok && rangeValue != "" {
			keyCondition += fmt.Sprintf(" AND %s = :rangeVal", indexConfig.RangeKey)
			av, err := attributevalue.Marshal(rangeValue)
			if err != nil {
				return "", nil, fmt.Errorf("failed to marshal range value: %w", err)
			}
			expressionValues[":rangeVal"] = av
		}
	}

	return keyCondition, expressionValues, nil
}

func (s *QueryService) executeGetItem(ctx context.Context, tableName, keyName, keyValue string) ([]map[string]interface{}, error) {
	av, err := attributevalue.Marshal(keyValue)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal key value: %w", err)
	}

	key := map[string]types.AttributeValue{
		keyName: av,
	}

	item, err := s.client.GetItem(ctx, tableName, key)
	if err != nil {
		return nil, err
	}

	if item == nil {
		return []map[string]interface{}{}, nil
	}

	result, err := s.convertItems([]map[string]types.AttributeValue{item})
	if err != nil {
		return nil, err
	}

	return result, nil
}

func (s *QueryService) convertItems(items []map[string]types.AttributeValue) ([]map[string]interface{}, error) {
	result := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		var m map[string]interface{}
		if err := attributevalue.UnmarshalMap(item, &m); err != nil {
			return nil, fmt.Errorf("failed to unmarshal item: %w", err)
		}
		result = append(result, m)
	}
	return result, nil
}

// UpdateParams holds the parameters for an update operation
type UpdateParams struct {
	Environment config.Environment
	Table       string
	Item        map[string]interface{}
}

// UpdateItem updates an item in the table
func (s *QueryService) UpdateItem(ctx context.Context, params UpdateParams) error {
	// Get table config
	tableConfig, ok := s.client.GetConfig().GetTableConfig(params.Environment, params.Table)
	if !ok {
		return fmt.Errorf("table %s not found for environment %s", params.Table, params.Environment)
	}

	// Convert the item to DynamoDB attribute values
	av, err := attributevalue.MarshalMap(params.Item)
	if err != nil {
		return fmt.Errorf("failed to marshal item: %w", err)
	}

	// Put the item (full replacement)
	return s.client.PutItem(ctx, tableConfig.Name, av)
}

