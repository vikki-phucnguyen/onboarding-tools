# DynamoDB Query Tool - Walkthrough

A Go web application for querying and managing DynamoDB tables (prospect and progress) across non-prod-uat and PROD environments.

## Project Structure

```
/Users/phucnguyen/vikki/tools/go/
├── main.go                     # Application entry point with HTTP server
├── config/
│   └── config.go               # Environment and table configuration
├── dynamodb/
│   ├── client.go               # DynamoDB client with AWS profile support
│   └── query.go                # Query and delete services
├── handlers/
│   └── handlers.go             # HTTP API handlers
├── static/
│   ├── index.html              # Main UI with delete modal
│   ├── styles.css              # Dark theme styling
│   └── app.js                  # Frontend JavaScript
├── go.mod
└── go.sum
```

---

## How to Run

```bash
cd /Users/phucnguyen/vikki/tools/go
go mod tidy
go run main.go
```

Open [http://localhost:8080](http://localhost:8080)

---

## Features

### Query Features
- Toggle between **non-prod-uat** and **PROD** environments
- Query **prospect** table by: phone_number, prospect_id, id_card_no, device_id, cif_number
- Query **progress** table by: onboard_id, phone_number + device_id, reserved_cif_number
- JSON results with syntax highlighting

### Results Management
- **📋 Copy All** - Copy all results as JSON
- **⬇️ Expand/Collapse All** - Toggle all items
- **View Modes** - Formatted, Compact, or Raw JSON
- **Per-item Copy** - Copy individual items

### Delete Feature (with Strong Confirmation)

Each result item has a **🗑️ Delete** button that triggers a secure multi-step confirmation:

1. **Item Information** - Shows environment, table, and primary key
2. **Environment Warning** - Special red warning for PROD deletions
3. **Type "DELETE"** - Must type DELETE to proceed
4. **Acknowledge Checkbox** - Must confirm understanding of irreversibility
5. **SHA256 Token** - Backend validates cryptographic confirmation token

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tables` | List tables and indexes |
| POST | `/api/query` | Execute a query |
| POST | `/api/delete` | Delete an item (with token) |

### Delete Request Example
```json
{
  "environment": "non-prod-uat",
  "table": "progress",
  "primaryKey": "onboard_id",
  "primaryValue": "abc123",
  "confirmationToken": "<sha256 hash>"
}
```

---

## Security Features

- **Confirmation Token**: SHA256 hash of `DELETE:{env}:{table}:{primaryValue}` prevents accidental deletions
- **Two-Step UI Confirmation**: Type DELETE + acknowledge checkbox required
- **PROD Warning**: Extra prominent warning for production deletions
- **Primary Key Validation**: Backend verifies primary key matches table config

---

## Files Changed

| File | Description |
|------|-------------|
| [main.go](file:///Users/phucnguyen/vikki/tools/go/main.go) | HTTP server with delete route |
| [config/config.go](file:///Users/phucnguyen/vikki/tools/go/config/config.go) | Added PrimaryKey to table config |
| [dynamodb/client.go](file:///Users/phucnguyen/vikki/tools/go/dynamodb/client.go) | Added DeleteItem method |
| [dynamodb/query.go](file:///Users/phucnguyen/vikki/tools/go/dynamodb/query.go) | Added DeleteItem service |
| [handlers/handlers.go](file:///Users/phucnguyen/vikki/tools/go/handlers/handlers.go) | Added delete handler with token validation |
| [static/index.html](file:///Users/phucnguyen/vikki/tools/go/static/index.html) | Added delete confirmation modal |
| [static/styles.css](file:///Users/phucnguyen/vikki/tools/go/static/styles.css) | Added modal and button styles |
| [static/app.js](file:///Users/phucnguyen/vikki/tools/go/static/app.js) | Added delete logic with SHA256 token |

