# BookLore API Usage Examples

This document provides comprehensive examples of how to use the BookLore API, including authentication, common operations, and advanced features.

## 📋 Table of Contents

- [Authentication](#authentication)
- [Book Management](#book-management)
- [Library Operations](#library-operations)
- [File Management](#file-management)
- [Metadata Management](#metadata-management)
- [Email Sharing](#email-sharing)
- [BookDrop Import](#bookdrop-import)
- [OPDS Integration](#opds-integration)
- [WebSocket Events](#websocket-events)
- [Error Handling](#error-handling)

## 🔐 Authentication

### User Registration

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123",
    "name": "John Doe"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER"
  }
}
```

### User Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'
```

### Token Refresh

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

### Using JWT Token

Include the JWT token in the Authorization header for protected endpoints:

```bash
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3000/api/v1/books
```

## 📚 Book Management

### Upload a Book

```bash
curl -X POST http://localhost:3000/api/v1/books \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@/path/to/book.epub" \
  -F "libraryId=1" \
  -F "shelfId=2"
```

**Response:**
```json
{
  "id": 123,
  "title": "Sample Book",
  "author": "Author Name",
  "fileName": "book.epub",
  "status": "PROCESSING",
  "libraryId": 1,
  "shelfId": 2,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Get Book Details

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3000/api/v1/books/123
```

**Response:**
```json
{
  "id": 123,
  "title": "Sample Book",
  "author": "Author Name",
  "isbn": "978-0123456789",
  "language": "en",
  "publisher": "Publisher Name",
  "publishDate": "2024-01-01T00:00:00.000Z",
  "description": "Book description...",
  "coverImage": "https://example.com/cover.jpg",
  "genres": ["Fiction", "Adventure"],
  "pageCount": 300,
  "status": "COMPLETED",
  "chapters": [
    {
      "id": "chapter1",
      "title": "Chapter 1",
      "order": 1
    }
  ]
}
```

### List Books

```bash
# Basic listing
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/v1/books?page=1&limit=20"

# With filters
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/v1/books?author=Tolkien&genre=Fantasy&status=COMPLETED"

# Search by title
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/v1/books?search=Lord%20of%20the%20Rings"
```

### Update Book Metadata

```bash
curl -X PUT http://localhost:3000/api/v1/books/123 \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "author": "Updated Author",
    "description": "Updated description",
    "genres": ["Fiction", "Fantasy"]
  }'
```

### Delete Book

```bash
curl -X DELETE http://localhost:3000/api/v1/books/123 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 🏛️ Library Operations

### Create Library

```bash
curl -X POST http://localhost:3000/api/v1/libraries \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Personal Library",
    "description": "Collection of my favorite books",
    "isPublic": false
  }'
```

### List Libraries

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3000/api/v1/libraries
```

### Get Library Books

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/v1/libraries/1/books?page=1&limit=20"
```

### Invite User to Library

```bash
curl -X POST http://localhost:3000/api/v1/libraries/1/invite \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "friend@example.com",
    "role": "READER"
  }'
```

### Create Shelf

```bash
curl -X POST http://localhost:3000/api/v1/libraries/1/shelves \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Science Fiction",
    "description": "Sci-fi book collection",
    "color": "#3498db"
  }'
```

## 📁 File Management

### Move Single File

```bash
curl -X POST http://localhost:3000/api/v1/file-management/move \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": 123,
    "targetLibraryId": 2,
    "targetShelfId": 5,
    "reason": "Reorganizing collection"
  }'
```

**Response:**
```json
{
  "success": true,
  "bookId": 123,
  "oldPath": "/library1/shelf2/book.epub",
  "newPath": "/library2/shelf5/book.epub",
  "transactionId": "txn_abc123"
}
```

### Bulk Move Files

```bash
curl -X POST http://localhost:3000/api/v1/file-management/bulk-move \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookIds": [123, 124, 125],
    "targetLibraryId": 2,
    "targetShelfId": 5,
    "reason": "Moving fantasy books to dedicated library"
  }'
```

### Check Movement Progress

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3000/api/v1/file-management/progress/txn_abc123
```

**Response:**
```json
{
  "transactionId": "txn_abc123",
  "totalFiles": 3,
  "processedFiles": 2,
  "status": "in_progress",
  "startTime": "2024-01-01T10:00:00.000Z",
  "estimatedCompletion": "2024-01-01T10:05:00.000Z"
}
```

### Rollback Transaction

```bash
curl -X POST http://localhost:3000/api/v1/file-management/rollback \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "txn_abc123",
    "reason": "Accidental move"
  }'
```

### Validate File Movement

```bash
curl -X POST http://localhost:3000/api/v1/file-management/validate-movement \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": 123,
    "targetLibraryId": 2,
    "targetShelfId": 5
  }'
```

## 🏷️ Metadata Management

### Search Metadata

```bash
curl -X POST http://localhost:3000/api/v1/metadata/search \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "The Lord of the Rings",
    "author": "J.R.R. Tolkien",
    "sources": ["google_books", "goodreads"],
    "limit": 10
  }'
```

**Response:**
```json
{
  "results": [
    {
      "source": "google_books",
      "results": [
        {
          "title": "The Lord of the Rings",
          "author": "J.R.R. Tolkien",
          "isbn": "978-0544003415",
          "publisher": "Houghton Mifflin Harcourt",
          "publishDate": "2012-02-15T00:00:00.000Z",
          "description": "Epic fantasy novel...",
          "coverImageUrl": "https://books.google.com/cover.jpg",
          "confidence": 0.95
        }
      ]
    }
  ],
  "bestMatch": {
    "bestMatch": {
      "title": "The Lord of the Rings",
      "author": "J.R.R. Tolkien",
      "confidence": 0.95
    },
    "confidence": 0.95,
    "reasoning": ["Strong title match", "Exact author match", "High source confidence"]
  }
}
```

### Update Book Metadata

```bash
curl -X PUT http://localhost:3000/api/v1/metadata/books/123 \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "The Fellowship of the Ring",
    "author": "J.R.R. Tolkien",
    "isbn": "978-0544003415",
    "publisher": "Houghton Mifflin Harcourt",
    "publishDate": "2012-02-15",
    "description": "First volume of The Lord of the Rings",
    "genres": ["Fantasy", "Adventure"],
    "source": "google_books",
    "reason": "Updated with accurate metadata"
  }'
```

### Bulk Metadata Update

```bash
curl -X POST http://localhost:3000/api/v1/metadata/books/bulk-update \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookIds": [123, 124, 125],
    "updates": {
      "publisher": "Houghton Mifflin Harcourt",
      "language": "en",
      "source": "manual"
    },
    "templateId": 1
  }'
```

### Get Metadata History

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/v1/metadata/history?bookId=123&page=1&limit=20"
```

### Create Metadata Template

```bash
curl -X POST http://localhost:3000/api/v1/metadata/templates \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fantasy Book Template",
    "description": "Template for fantasy books",
    "fields": [
      {
        "fieldName": "language",
        "defaultValue": "en",
        "required": true
      },
      {
        "fieldName": "genres",
        "defaultValue": ["Fantasy"],
        "required": false
      }
    ],
    "isPublic": false
  }'
```

## 📧 Email Sharing

### Send Book via Email

```bash
curl -X POST http://localhost:3000/api/v1/email/send-book \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": 123,
    "recipients": ["friend@example.com", "colleague@example.com"],
    "subject": "Check out this great book!",
    "message": "I thought you might enjoy this book. Happy reading!",
    "includeAttachment": true
  }'
```

### Manage Email Recipients

```bash
# Add recipient
curl -X POST http://localhost:3000/api/v1/email/recipients \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "friend@example.com",
    "name": "Best Friend",
    "isDefault": true
  }'

# List recipients
curl -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3000/api/v1/email/recipients
```

### Configure Email Provider

```bash
curl -X POST http://localhost:3000/api/v1/email/providers \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gmail SMTP",
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "username": "your-email@gmail.com",
    "password": "your-app-password",
    "isDefault": true
  }'
```

## 📥 BookDrop Import

### Get BookDrop Status

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3000/api/v1/bookdrop/status
```

**Response:**
```json
{
  "pendingFiles": 5,
  "processingFiles": 2,
  "hasNewFiles": true,
  "lastScan": "2024-01-01T10:00:00.000Z"
}
```

### List Pending Files

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/v1/bookdrop/files?status=PENDING&page=1&limit=20"
```

### Finalize Import

```bash
curl -X POST http://localhost:3000/api/v1/bookdrop/finalize \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "bookdropId": 1,
        "libraryId": 1,
        "shelfId": 2,
        "title": "Corrected Title",
        "author": "Corrected Author"
      },
      {
        "bookdropId": 2,
        "libraryId": 1,
        "shelfId": 3
      }
    ]
  }'
```

### Discard Files

```bash
curl -X POST http://localhost:3000/api/v1/bookdrop/discard \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileIds": [1, 2, 3],
    "reason": "Duplicate files"
  }'
```

## 📖 OPDS Integration

### Get OPDS Catalog

```bash
# Root catalog
curl http://localhost:3000/opds/catalog

# Library catalog
curl http://localhost:3000/opds/libraries/1

# Search
curl "http://localhost:3000/opds/search?q=tolkien"
```

### OPDS Authentication

```bash
# Using HTTP Basic Auth
curl -u "username:password" http://localhost:3000/opds/catalog

# Using OPDS credentials
curl -H "Authorization: Basic $(echo -n 'opds_user:opds_pass' | base64)" \
     http://localhost:3000/opds/catalog
```

### Download Book via OPDS

```bash
curl -u "username:password" \
     -o "book.epub" \
     http://localhost:3000/opds/books/123/download
```

## 🔌 WebSocket Events

### Connect to WebSocket

```javascript
// JavaScript client example
const socket = io('http://localhost:3000/progress', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('connect', () => {
  console.log('Connected to progress updates');
});

socket.on('progress-update', (data) => {
  console.log('Progress update:', data);
  // Handle progress update
});

socket.on('book-processed', (data) => {
  console.log('Book processing completed:', data);
});

socket.on('file-movement-progress', (data) => {
  console.log('File movement progress:', data);
});
```

### Join Library Room

```javascript
socket.emit('join-library', { libraryId: 1 });

socket.on('joined-library', (data) => {
  console.log('Joined library:', data.libraryId);
});
```

### Get Current Progress

```javascript
socket.emit('get-progress', { jobId: 'job_123' });

socket.on('progress-status', (data) => {
  console.log('Current progress:', data);
});
```

## ❌ Error Handling

### Standard Error Response

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/v1/books",
  "details": [
    {
      "field": "title",
      "message": "Title is required"
    }
  ]
}
```

### Common HTTP Status Codes

- **200 OK**: Request successful
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource conflict (e.g., duplicate)
- **422 Unprocessable Entity**: Validation failed
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

### Error Handling Examples

```bash
# Handle authentication error
response=$(curl -s -w "%{http_code}" -o response.json http://localhost:3000/api/v1/books)
if [ "$response" = "401" ]; then
  echo "Authentication required"
  # Refresh token or re-authenticate
fi

# Handle validation errors
curl -X POST http://localhost:3000/api/v1/books \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}' \
  | jq '.details[] | "\(.field): \(.message)"'
```

### Rate Limiting

When rate limited, the API returns:

```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

Handle rate limiting:

```bash
response=$(curl -s -w "%{http_code}" -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3000/api/v1/books)

if [ "$response" = "429" ]; then
  echo "Rate limited, waiting 60 seconds..."
  sleep 60
  # Retry request
fi
```

## 🔧 Advanced Usage

### Pagination

```bash
# Get first page
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/v1/books?page=1&limit=20"

# Navigate through pages
for page in {1..5}; do
  curl -H "Authorization: Bearer $JWT_TOKEN" \
       "http://localhost:3000/api/v1/books?page=$page&limit=20" \
       | jq '.data[].title'
done
```

### Filtering and Sorting

```bash
# Complex filtering
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/v1/books?author=Tolkien&genre=Fantasy&publishedAfter=2000-01-01&sort=publishDate&order=desc"

# Search with filters
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/v1/books?search=lord%20rings&language=en&status=COMPLETED"
```

### Batch Operations

```bash
# Batch delete books
curl -X DELETE http://localhost:3000/api/v1/books/batch \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookIds": [123, 124, 125],
    "reason": "Cleaning up duplicates"
  }'

# Batch update metadata
curl -X PUT http://localhost:3000/api/v1/books/batch \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookIds": [123, 124, 125],
    "updates": {
      "language": "en",
      "publisher": "Updated Publisher"
    }
  }'
```

This comprehensive guide covers the most common API usage patterns. For additional endpoints and advanced features, refer to the interactive API documentation at `/api/docs`.