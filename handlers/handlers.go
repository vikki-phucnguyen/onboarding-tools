package handlers

import (
	"crypto/sha256"
	"encoding/hex"
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

// DeleteRequest represents the request body for DELETE /api/delete
type DeleteRequest struct {
	Environment       string `json:"environment"`
	Table             string `json:"table"`
	PrimaryKey        string `json:"primaryKey"`
	PrimaryValue      string `json:"primaryValue"`
	ConfirmationToken string `json:"confirmationToken"` // SHA256 hash of "DELETE:{env}:{table}:{primaryValue}"
}

// DeleteResponse represents the response for DELETE /api/delete
type DeleteResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

// GenerateDeleteToken generates the expected confirmation token for a delete operation
func GenerateDeleteToken(env, table, primaryValue string) string {
	data := fmt.Sprintf("DELETE:%s:%s:%s", env, table, primaryValue)
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}

// DeleteItem handles delete requests with strong confirmation
func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req DeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendDeleteErrorResponse(w, "Invalid request body: "+err.Error())
		return
	}

	// Validate environment
	env := config.Environment(req.Environment)
	if env != config.NonProdUAT && env != config.PROD {
		sendDeleteErrorResponse(w, "Invalid environment: "+req.Environment)
		return
	}

	// Validate required fields
	if req.Table == "" || req.PrimaryKey == "" || req.PrimaryValue == "" {
		sendDeleteErrorResponse(w, "Missing required fields: table, primaryKey, and primaryValue are required")
		return
	}

	// Verify confirmation token - this ensures the frontend has properly confirmed the deletion
	expectedToken := GenerateDeleteToken(req.Environment, req.Table, req.PrimaryValue)
	if req.ConfirmationToken != expectedToken {
		sendDeleteErrorResponse(w, "Invalid confirmation token. Please confirm the deletion properly.")
		return
	}

	// Execute deletion
	params := dynamodb.DeleteParams{
		Environment:  env,
		Table:        req.Table,
		PrimaryKey:   req.PrimaryKey,
		PrimaryValue: req.PrimaryValue,
	}

	if err := h.queryService.DeleteItem(r.Context(), params); err != nil {
		sendDeleteErrorResponse(w, "Failed to delete item: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(DeleteResponse{
		Success: true,
		Message: fmt.Sprintf("Successfully deleted item with %s=%s from %s", req.PrimaryKey, req.PrimaryValue, req.Table),
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

func sendDeleteErrorResponse(w http.ResponseWriter, errMsg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(DeleteResponse{
		Success: false,
		Error:   errMsg,
	})
}

