package handlers

import (
	"encoding/json"
	"fmt"
	"letsgo/config"
	"letsgo/dynamodb"
	"net/http"
)

// Handler holds HTTP handler dependencies
type Handler struct {
	config       *config.Config
	queryService *dynamodb.QueryService
}

// NewHandler creates a new handler
func NewHandler(cfg *config.Config, queryService *dynamodb.QueryService) *Handler {
	return &Handler{
		config:       cfg,
		queryService: queryService,
	}
}

// TablesResponse represents the response for GET /api/tables
type TablesResponse struct {
	Environments []string                                 `json:"environments"`
	Tables       map[string]map[string]config.TableConfig `json:"tables"`
}

// GetTables returns available tables and their indexes
func (h *Handler) GetTables(w http.ResponseWriter, r *http.Request) {
	response := TablesResponse{
		Environments: []string{string(config.NonProdUAT), string(config.PROD)},
		Tables: map[string]map[string]config.TableConfig{
			string(config.NonProdUAT): h.config.Tables[config.NonProdUAT],
			string(config.PROD):       h.config.Tables[config.PROD],
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// QueryRequest represents the request body for POST /api/query
type QueryRequest struct {
	Environment string            `json:"environment"`
	Table       string            `json:"table"`
	IndexName   string            `json:"indexName"`
	Values      map[string]string `json:"values"`
}

// QueryResponse represents the response for POST /api/query
type QueryResponse struct {
	Success bool                     `json:"success"`
	Count   int                      `json:"count"`
	Items   []map[string]interface{} `json:"items"`
	Error   string                   `json:"error,omitempty"`
}

// ExecuteQuery handles query requests
func (h *Handler) ExecuteQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body: "+err.Error())
		return
	}

	// Validate environment
	env := config.Environment(req.Environment)
	if env != config.NonProdUAT && env != config.PROD {
		sendErrorResponse(w, "Invalid environment: "+req.Environment)
		return
	}

	params := dynamodb.QueryParams{
		Environment: env,
		Table:       req.Table,
		IndexName:   req.IndexName,
		Values:      req.Values,
	}

	items, err := h.queryService.ExecuteQuery(r.Context(), params)
	if err != nil {
		sendErrorResponse(w, err.Error())
		return
	}

	response := QueryResponse{
		Success: true,
		Count:   len(items),
		Items:   items,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// UpdateRequest represents the request body for POST /api/update
type UpdateRequest struct {
	Environment string                 `json:"environment"`
	Table       string                 `json:"table"`
	Item        map[string]interface{} `json:"item"`
}

// UpdateResponse represents the response for POST /api/update
type UpdateResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

// UpdateItem handles update requests
func (h *Handler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req UpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendUpdateErrorResponse(w, "Invalid request body: "+err.Error())
		return
	}

	// Validate environment
	env := config.Environment(req.Environment)
	if env != config.NonProdUAT && env != config.PROD {
		sendUpdateErrorResponse(w, "Invalid environment: "+req.Environment)
		return
	}

	// Validate item is provided
	if len(req.Item) == 0 {
		sendUpdateErrorResponse(w, "Item data is required")
		return
	}

	// Execute update
	params := dynamodb.UpdateParams{
		Environment: env,
		Table:       req.Table,
		Item:        req.Item,
	}

	if err := h.queryService.UpdateItem(r.Context(), params); err != nil {
		sendUpdateErrorResponse(w, "Failed to update item: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(UpdateResponse{
		Success: true,
		Message: fmt.Sprintf("Successfully updated item in %s", req.Table),
	})
}

func sendErrorResponse(w http.ResponseWriter, errMsg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(QueryResponse{
		Success: false,
		Error:   errMsg,
	})
}

func sendUpdateErrorResponse(w http.ResponseWriter, errMsg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(UpdateResponse{
		Success: false,
		Error:   errMsg,
	})
}

