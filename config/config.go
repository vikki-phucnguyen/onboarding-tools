package config

// Environment represents the deployment environment
type Environment string

const (
	NonProdUAT Environment = "non-prod-uat"
	PROD       Environment = "prod"
)

// IndexConfig defines a queryable index on a table
type IndexConfig struct {
	Name        string `json:"name"`        // Index name (empty for primary key)
	DisplayName string `json:"displayName"` // Human-readable name
	HashKey     string `json:"hashKey"`     // Partition key attribute
	RangeKey    string `json:"rangeKey"`    // Sort key attribute (optional)
}

// TableConfig defines a DynamoDB table and its indexes
type TableConfig struct {
	Name        string        `json:"name"`
	DisplayName string        `json:"displayName"`
	PrimaryKey  string        `json:"primaryKey"`  // Primary key attribute name
	SortKey     string        `json:"sortKey"`     // Sort key attribute name (optional)
	Indexes     []IndexConfig `json:"indexes"`
}

// Config holds all application configuration
type Config struct {
	AWSProfile string
	AWSRegion  string
	Tables     map[Environment]map[string]TableConfig
}

// GetDefaultConfig returns the default configuration
func GetDefaultConfig() *Config {
	return &Config{
		AWSProfile: "default",
		AWSRegion:  "ap-southeast-1",
		Tables: map[Environment]map[string]TableConfig{
			NonProdUAT: {
				"prospect": {
					Name:        "non-prod-uat-onboarding-prospect",
					DisplayName: "Prospect",
					PrimaryKey:  "phone_number",
					Indexes: []IndexConfig{
						{Name: "", DisplayName: "Phone Number (Primary)", HashKey: "phone_number", RangeKey: ""},
						{Name: "prospect_id_index", DisplayName: "Prospect ID", HashKey: "prospect_id", RangeKey: ""},
						{Name: "id_card_no_index", DisplayName: "ID Card Number", HashKey: "id_card_no", RangeKey: ""},
						{Name: "device_id_index", DisplayName: "Device ID", HashKey: "device_id", RangeKey: ""},
						{Name: "cif_number_index", DisplayName: "CIF Number", HashKey: "cif_number", RangeKey: ""},
					},
				},
				"progress": {
					Name:        "non-prod-uat-onboarding-progress",
					DisplayName: "Onboard Progress",
					PrimaryKey:  "onboard_id",
					Indexes: []IndexConfig{
						{Name: "", DisplayName: "Onboard ID (Primary)", HashKey: "onboard_id", RangeKey: ""},
						{Name: "phone_number_device_id", DisplayName: "Phone + Device ID", HashKey: "phone_number", RangeKey: "device_id"},
						{Name: "reserved_cif_number_index", DisplayName: "Reserved CIF Number", HashKey: "reserved_cif_number", RangeKey: ""},
					},
				},
			},
			PROD: {
				"prospect": {
					Name:        "prod-onboarding-prospect",
					DisplayName: "Prospect",
					PrimaryKey:  "phone_number",
					Indexes: []IndexConfig{
						{Name: "", DisplayName: "Phone Number (Primary)", HashKey: "phone_number", RangeKey: ""},
						{Name: "prospect_id_index", DisplayName: "Prospect ID", HashKey: "prospect_id", RangeKey: ""},
						{Name: "id_card_no_index", DisplayName: "ID Card Number", HashKey: "id_card_no", RangeKey: ""},
						{Name: "device_id_index", DisplayName: "Device ID", HashKey: "device_id", RangeKey: ""},
						{Name: "cif_number_index", DisplayName: "CIF Number", HashKey: "cif_number", RangeKey: ""},
					},
				},
				"progress": {
					Name:        "prod-onboarding-progress",
					DisplayName: "Onboard Progress",
					PrimaryKey:  "onboard_id",
					Indexes: []IndexConfig{
						{Name: "", DisplayName: "Onboard ID (Primary)", HashKey: "onboard_id", RangeKey: ""},
						{Name: "phone_number_device_id", DisplayName: "Phone + Device ID", HashKey: "phone_number", RangeKey: "device_id"},
						{Name: "reserved_cif_number_index", DisplayName: "Reserved CIF Number", HashKey: "reserved_cif_number", RangeKey: ""},
					},
				},
			},
		},
	}
}

// GetTableConfig returns the table configuration for a given environment and table
func (c *Config) GetTableConfig(env Environment, tableName string) (TableConfig, bool) {
	envTables, ok := c.Tables[env]
	if !ok {
		return TableConfig{}, false
	}
	table, ok := envTables[tableName]
	return table, ok
}

// GetIndexConfig returns the index configuration for a given table and index name
func (c *Config) GetIndexConfig(env Environment, tableName, indexName string) (IndexConfig, bool) {
	table, ok := c.GetTableConfig(env, tableName)
	if !ok {
		return IndexConfig{}, false
	}
	for _, idx := range table.Indexes {
		if idx.Name == indexName {
			return idx, true
		}
	}
	return IndexConfig{}, false
}
