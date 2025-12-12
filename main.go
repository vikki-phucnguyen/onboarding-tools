package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"

	"letsgo/config"
	"letsgo/dynamodb"
	"letsgo/handlers"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	// Get AWS profile from environment or use default
	profile := os.Getenv("AWS_PROFILE")
	if profile == "" {
		profile = "default"
	}

	// Initialize configuration
	cfg := config.GetDefaultConfig()
	cfg.AWSProfile = profile

	// Initialize DynamoDB client
	dbClient, err := dynamodb.NewClient(cfg)
	if err != nil {
		log.Fatalf("Failed to create DynamoDB client: %v", err)
	}

	// Initialize services
	queryService := dynamodb.NewQueryService(dbClient)

	// Initialize handlers
	handler := handlers.NewHandler(cfg, queryService)

	// Setup routes
	http.HandleFunc("/api/tables", handler.GetTables)
	http.HandleFunc("/api/query", handler.ExecuteQuery)
	http.HandleFunc("/api/update", handler.UpdateItem)

	// Serve static files
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("Failed to create static filesystem: %v", err)
	}
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))

	// Serve index.html at root
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		content, err := staticFiles.ReadFile("static/index.html")
		if err != nil {
			http.Error(w, "Failed to load page", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.Write(content)
	})

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 DynamoDB Query Tool starting on http://localhost:%s", port)
	log.Printf("📦 Using AWS Profile: %s", profile)
	log.Printf("🌍 AWS Region: %s", cfg.AWSRegion)

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
