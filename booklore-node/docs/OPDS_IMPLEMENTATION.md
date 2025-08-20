# OPDS Protocol Implementation

## Overview

This document describes the OPDS (Open Publication Distribution System) 1.2 protocol implementation in BookLore. The OPDS protocol allows standard e-book readers to access and browse the BookLore library catalog.

## Features Implemented

### 1. OPDS 1.2 Protocol Compliance
- Standard ATOM XML catalog generation
- Proper XML namespaces and structure
- OPDS-specific elements and attributes
- OpenSearch integration for search functionality

### 2. Authentication
- HTTP Basic Authentication support
- OPDS user management system
- Permission-based access control
- Integration with existing user system

### 3. Catalog Structure
- Root catalog with library listings
- Library-specific catalogs
- Shelf-based organization
- Book acquisition links

### 4. Search Functionality
- Full-text search across books
- OpenSearch description document
- Paginated search results
- Search by title, author, description, and ISBN

## API Endpoints

### OPDS Catalog Endpoints
- `GET /opds/catalog` - Root OPDS catalog
- `GET /opds/libraries/{id}` - Library catalog
- `GET /opds/libraries/{id}/books` - All books in library
- `GET /opds/libraries/{id}/shelves/{shelfId}` - Books in shelf
- `GET /opds/search` - Search books
- `GET /opds/search.xml` - OpenSearch description
- `GET /opds/books/{id}/download` - Download book

### OPDS User Management (Admin API)
- `GET /api/v1/opds/user` - Get OPDS user info
- `POST /api/v1/opds/user` - Create OPDS account
- `PUT /api/v1/opds/user` - Update OPDS account
- `DELETE /api/v1/opds/user` - Delete OPDS account

## Authentication

### HTTP Basic Auth
OPDS endpoints require HTTP Basic Authentication:
```
Authorization: Basic <base64(username:password)>
```

### OPDS User Creation
Users must create an OPDS account through the admin API:
```javascript
POST /api/v1/opds/user
{
  "username": "opds_username",
  "password": "opds_password"
}
```

## XML Structure

### Root Catalog
```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" 
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>http://localhost:3000/opds/catalog</id>
  <title>BookLore Library</title>
  <updated>2023-01-01T00:00:00.000Z</updated>
  <author>
    <name>BookLore</name>
  </author>
  <link rel="start" href="http://localhost:3000/opds/catalog" 
        type="application/atom+xml;profile=opds-catalog"/>
  <link rel="search" href="http://localhost:3000/opds/search.xml" 
        type="application/opensearchdescription+xml"/>
  
  <entry>
    <title>My Library</title>
    <id>http://localhost:3000/opds/libraries/1</id>
    <updated>2023-01-01T00:00:00.000Z</updated>
    <link rel="subsection" href="http://localhost:3000/opds/libraries/1" 
          type="application/atom+xml;profile=opds-catalog"/>
  </entry>
</feed>
```

### Book Entry
```xml
<entry>
  <title>Book Title</title>
  <id>http://localhost:3000/opds/books/1</id>
  <updated>2023-01-01T00:00:00.000Z</updated>
  <author><name>Author Name</name></author>
  <summary>Book description</summary>
  <content type="text">Author: Author Name | Publisher: Publisher</content>
  
  <link rel="http://opds-spec.org/acquisition" 
        href="http://localhost:3000/opds/books/1/download" 
        type="application/epub+zip" 
        title="Download Book Title"/>
  <link rel="http://opds-spec.org/image" 
        href="http://localhost:3000/api/v1/books/1/cover" 
        type="image/jpeg" 
        title="Cover Image"/>
</feed>
```

## Compatible Readers

The OPDS implementation is compatible with standard OPDS readers including:
- Aldiko
- FBReader
- Moon+ Reader
- KyBook
- Marvin
- And other OPDS 1.2 compliant readers

## Security Features

### XML Escaping
All user-provided content is properly escaped to prevent XML injection:
- `<` → `&lt;`
- `>` → `&gt;`
- `&` → `&amp;`
- `"` → `&quot;`
- `'` → `&#39;`

### Access Control
- Users can only access libraries they have permission to view
- OPDS authentication is separate from main application authentication
- Permission checks are performed for all catalog and download requests

## Testing

### Unit Tests
Run OPDS unit tests:
```bash
pnpm test src/opds/opds.service.spec.ts --run
```

### Integration Tests
Run OPDS functionality tests:
```bash
node scripts/test-opds-simple.js
```

### Manual Testing
Test with OPDS reader:
1. Create OPDS account via admin API
2. Configure reader with: `http://localhost:3000/opds/catalog`
3. Use HTTP Basic Auth credentials
4. Browse and download books

## Configuration

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT secret for admin API authentication

### Database Schema
The OPDS implementation uses the `opds_users` table:
```sql
CREATE TABLE opds_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR UNIQUE NOT NULL,
  password VARCHAR NOT NULL,
  is_active BOOLEAN DEFAULT true,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Performance Considerations

### Caching
- Library catalogs are cached for 10 minutes
- Book lists are cached for 3 minutes
- Search results are not cached to ensure freshness

### Pagination
- Search results support pagination via `page` and `limit` parameters
- Default page size is 20 items
- Maximum page size is 100 items

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify OPDS user account exists
   - Check username/password combination
   - Ensure user account is active

2. **Empty Catalog**
   - Verify user has access to libraries
   - Check library permissions
   - Ensure books exist in accessible libraries

3. **Download Fails**
   - Verify book file exists on disk
   - Check file permissions
   - Ensure user has access to book's library

### Debug Logging
Enable debug logging for OPDS requests:
```javascript
// In development
console.log('OPDS request:', req.url, req.headers.authorization);
```

## Future Enhancements

### Planned Features
- OPDS 2.0 support
- Advanced search filters
- Collection grouping
- Reading progress sync
- Recommendation feeds

### Performance Improvements
- Enhanced caching strategies
- CDN integration for book downloads
- Compressed catalog responses
- Streaming large catalogs