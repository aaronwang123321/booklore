# T14 BookDrop批量导入 Implementation

## Overview

The T14 BookDrop implementation provides a comprehensive file monitoring and batch import system for BookLore. This feature allows users to drop book files into a designated folder, which are then automatically detected, processed, and prepared for import into their libraries.

## Features Implemented

### 1. 文件监控服务，检测新增文件 (File Monitoring Service)

- **File Watcher Service**: Uses `chokidar` to monitor the BookDrop folder for new files
- **Supported Formats**: `.epub`, `.pdf`, `.cbz`, `.cbr`
- **Real-time Detection**: Automatically detects when new files are added
- **Write Completion**: Waits for files to finish being written before processing
- **Event-driven Architecture**: Emits events when files are detected

### 2. 创建文件预处理和元数据提取 (File Preprocessing and Metadata Extraction)

- **Filename Parsing**: Extracts title and author from common filename patterns:
  - `Author - Title.ext`
  - `Title by Author.ext`
  - `Author_Title.ext`
- **Metadata Storage**: Stores extracted metadata in the database
- **File Information**: Captures file size, type, and path information
- **Status Tracking**: Tracks processing status (PENDING, PROCESSING, COMPLETED, FAILED, DISCARDED)

### 3. 实现批量导入确认和文件移动 (Batch Import Confirmation and File Movement)

- **Batch Processing**: Allows multiple files to be imported simultaneously
- **Library Assignment**: Files can be assigned to specific libraries and shelves
- **File Movement**: Moves files from BookDrop folder to appropriate library locations
- **Book Creation**: Creates book records in the database with proper metadata
- **Target Path Generation**: Automatically generates appropriate file paths based on library structure

### 4. 集成导入进度通知和错误处理 (Import Progress Notification and Error Handling)

- **WebSocket Events**: Real-time notifications for file processing events
- **Progress Tracking**: Tracks the status of each file through the import process
- **Error Handling**: Comprehensive error handling with detailed error messages
- **Discard Functionality**: Allows users to discard unwanted files
- **Status Updates**: Real-time status updates for all processing stages

## Architecture

### Core Components

1. **BookdropModule**: Main module that orchestrates all BookDrop functionality
2. **FileWatcherService**: Monitors the BookDrop folder for new files
3. **BookdropService**: Handles file processing, metadata extraction, and import logic
4. **BookdropController**: Provides REST API endpoints for BookDrop operations

### Database Schema

```prisma
model BookdropFile {
  id            Int               @id @default(autoincrement())
  filePath      String            @unique
  fileName      String
  fileSize      Int
  fileType      String?
  status        BookdropStatus    @default(PENDING)
  metadata      Json?
  error         String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
}

enum BookdropStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  DISCARDED
}
```

## API Endpoints

### GET /api/v1/bookdrop/notification-summary
Returns a summary of pending and processing files.

**Response:**
```json
{
  "pendingFiles": 5,
  "processingFiles": 2,
  "hasNewFiles": true
}
```

### GET /api/v1/bookdrop/files
Returns all BookDrop files with their current status.

**Response:**
```json
[
  {
    "id": 1,
    "filePath": "/bookdrop/Author - Book Title.epub",
    "fileName": "Author - Book Title.epub",
    "fileSize": 1024000,
    "fileType": "epub",
    "status": "PENDING",
    "metadata": {
      "title": "Book Title",
      "author": "Author",
      "extractedFromFileName": true
    },
    "error": null,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
]
```

### POST /api/v1/bookdrop/finalize
Finalizes the import of selected BookDrop files.

**Request:**
```json
{
  "items": [
    {
      "bookdropId": 1,
      "libraryId": 1,
      "shelfId": 2,
      "title": "Custom Title",
      "author": "Custom Author"
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "bookdropId": 1,
      "bookId": 123,
      "success": true
    }
  ]
}
```

### DELETE /api/v1/bookdrop/discard
Discards selected BookDrop files.

**Request:**
```json
{
  "bookdropIds": [1, 2, 3]
}
```

## Configuration

### Environment Variables

```bash
# BookDrop folder path
BOOKDROP_PATH="./bookdrop"

# Maximum file size (optional)
MAX_FILE_SIZE=104857600
```

### Docker Configuration

```yaml
volumes:
  - /your/local/path/to/booklore/bookdrop:/bookdrop
```

## Event System

The BookDrop system emits the following events:

- `bookdrop.file.added`: When a new file is detected
- `bookdrop.file.processed`: When a file has been processed successfully
- `bookdrop.file.error`: When an error occurs during processing
- `bookdrop.import.completed`: When a batch import is completed

## Error Handling

The system includes comprehensive error handling for:

- File system errors (permissions, disk space, etc.)
- Database errors during record creation
- Invalid file formats
- Library access permissions
- File movement failures

## Testing

### Unit Tests
- Complete test coverage for BookdropService
- Mock implementations for file system operations
- Test scenarios for all major functionality

### Integration Tests
- End-to-end testing script (`test-t14-complete.js`)
- Validation script (`validate-t14.js`)
- Performance testing capabilities

## Usage Example

1. **Setup**: Configure the BOOKDROP_PATH environment variable
2. **Drop Files**: Add book files to the BookDrop folder
3. **Monitor**: Files are automatically detected and processed
4. **Review**: Use the API to review detected files and their metadata
5. **Import**: Finalize the import by assigning files to libraries
6. **Complete**: Files are moved to their final locations and book records are created

## Performance Considerations

- File watching is optimized to avoid excessive CPU usage
- Batch processing reduces database load
- Metadata extraction is performed asynchronously
- File operations use streaming where possible
- Memory usage is optimized for large files

## Security

- File type validation prevents malicious uploads
- Path traversal protection
- Library access control integration
- File size limits to prevent abuse
- Secure file movement operations

## Future Enhancements

- Advanced metadata extraction from file contents
- Integration with external metadata services
- Duplicate detection and handling
- Automatic organization based on metadata
- Progress bars for large file operations
- Thumbnail generation for supported formats