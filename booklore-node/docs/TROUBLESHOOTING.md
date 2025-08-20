# BookLore Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the BookLore SaaS backend.

## 📋 Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Application Issues](#application-issues)
- [Database Issues](#database-issues)
- [File Processing Issues](#file-processing-issues)
- [Authentication Issues](#authentication-issues)
- [Performance Issues](#performance-issues)
- [Network & Connectivity](#network--connectivity)
- [Storage Issues](#storage-issues)
- [Email Issues](#email-issues)
- [WebSocket Issues](#websocket-issues)
- [Deployment Issues](#deployment-issues)
- [Monitoring & Logging](#monitoring--logging)

## 🔍 Quick Diagnostics

### Health Check

First, check if the application is running and healthy:

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health check
curl http://localhost:3000/health/detailed

# Expected response
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### System Status

```bash
# Check service status
sudo systemctl status booklore

# Check process
ps aux | grep node

# Check port usage
sudo netstat -tlnp | grep :3000

# Check memory usage
free -h
df -h
```

### Log Analysis

```bash
# Application logs
sudo journalctl -u booklore -f --since "1 hour ago"

# Error logs only
sudo journalctl -u booklore -p err --since "1 hour ago"

# Search for specific errors
sudo journalctl -u booklore | grep -i "error\|exception\|failed"
```

## 🚀 Application Issues

### Application Won't Start

**Symptoms:**
- Service fails to start
- Port binding errors
- Module not found errors

**Diagnosis:**
```bash
# Check service status
sudo systemctl status booklore

# View startup logs
sudo journalctl -u booklore -n 50

# Check environment variables
sudo -u booklore env | grep -E "(NODE_ENV|DATABASE_URL|PORT)"

# Verify Node.js version
node --version
```

**Solutions:**

1. **Port Already in Use:**
   ```bash
   # Find process using port 3000
   sudo lsof -i :3000
   
   # Kill the process
   sudo kill -9 <PID>
   
   # Or change port in .env
   echo "PORT=3001" >> .env
   ```

2. **Missing Dependencies:**
   ```bash
   # Reinstall dependencies
   cd /path/to/booklore-node
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Permission Issues:**
   ```bash
   # Fix ownership
   sudo chown -R booklore:booklore /path/to/booklore-node
   
   # Fix permissions
   chmod +x /path/to/booklore-node/dist/main.js
   ```

### Application Crashes

**Symptoms:**
- Service stops unexpectedly
- Out of memory errors
- Unhandled exceptions

**Diagnosis:**
```bash
# Check crash logs
sudo journalctl -u booklore --since "1 hour ago" | grep -i "crash\|exit\|killed"

# Check memory usage
ps aux | grep node | awk '{print $4, $11}'

# Check for core dumps
ls -la /var/crash/
```

**Solutions:**

1. **Memory Issues:**
   ```bash
   # Increase Node.js memory limit
   export NODE_OPTIONS="--max-old-space-size=2048"
   
   # Enable memory monitoring
   export ENABLE_MEMORY_MONITORING=true
   ```

2. **Unhandled Exceptions:**
   ```bash
   # Enable debug mode
   export DEBUG=booklore:*
   export LOG_LEVEL=debug
   
   # Restart with debugging
   sudo systemctl restart booklore
   ```

### Slow Response Times

**Symptoms:**
- API requests timeout
- High response times
- Queue backlog

**Diagnosis:**
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/v1/books

# curl-format.txt content:
#     time_namelookup:  %{time_namelookup}\n
#        time_connect:  %{time_connect}\n
#     time_appconnect:  %{time_appconnect}\n
#    time_pretransfer:  %{time_pretransfer}\n
#       time_redirect:  %{time_redirect}\n
#  time_starttransfer:  %{time_starttransfer}\n
#                     ----------\n
#          time_total:  %{time_total}\n

# Check queue status
curl http://localhost:3000/api/v1/queue/status

# Monitor system resources
htop
iotop
```

**Solutions:**

1. **Database Optimization:**
   ```sql
   -- Check slow queries
   SELECT query, calls, total_time, mean_time 
   FROM pg_stat_statements 
   ORDER BY total_time DESC 
   LIMIT 10;
   
   -- Analyze tables
   ANALYZE;
   
   -- Vacuum database
   VACUUM ANALYZE;
   ```

2. **Cache Configuration:**
   ```bash
   # Check Redis status
   redis-cli info stats
   
   # Clear cache if needed
   redis-cli FLUSHALL
   ```

## 🗄️ Database Issues

### Connection Failures

**Symptoms:**
- "Connection refused" errors
- "Too many connections" errors
- Database timeout errors

**Diagnosis:**
```bash
# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection count
psql $DATABASE_URL -c "
SELECT count(*) as active_connections 
FROM pg_stat_activity 
WHERE state = 'active';"

# Check max connections
psql $DATABASE_URL -c "SHOW max_connections;"
```

**Solutions:**

1. **Connection Pool Issues:**
   ```bash
   # Increase connection pool size
   echo "DATABASE_POOL_SIZE=20" >> .env
   
   # Restart application
   sudo systemctl restart booklore
   ```

2. **PostgreSQL Configuration:**
   ```bash
   # Edit postgresql.conf
   sudo nano /etc/postgresql/15/main/postgresql.conf
   
   # Increase max_connections
   max_connections = 200
   
   # Restart PostgreSQL
   sudo systemctl restart postgresql
   ```

### Migration Issues

**Symptoms:**
- Migration failures
- Schema mismatch errors
- Foreign key constraint errors

**Diagnosis:**
```bash
# Check migration status
npx prisma migrate status

# View migration history
psql $DATABASE_URL -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC;"

# Check schema differences
npx prisma db pull
git diff prisma/schema.prisma
```

**Solutions:**

1. **Reset Database:**
   ```bash
   # CAUTION: This will delete all data
   npx prisma migrate reset
   
   # Or manually reset
   npx prisma db push --force-reset
   ```

2. **Fix Migration:**
   ```bash
   # Mark migration as applied
   npx prisma migrate resolve --applied "migration_name"
   
   # Create new migration
   npx prisma migrate dev --name fix_schema_issue
   ```

### Data Corruption

**Symptoms:**
- Inconsistent data
- Foreign key violations
- Duplicate key errors

**Diagnosis:**
```sql
-- Check for orphaned records
SELECT b.id, b.title 
FROM books b 
LEFT JOIN libraries l ON b.library_id = l.id 
WHERE l.id IS NULL;

-- Check for duplicate ISBNs
SELECT isbn, COUNT(*) 
FROM books 
WHERE isbn IS NOT NULL 
GROUP BY isbn 
HAVING COUNT(*) > 1;

-- Check database integrity
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE schemaname = 'public';
```

**Solutions:**

1. **Clean Up Data:**
   ```sql
   -- Remove orphaned records
   DELETE FROM books 
   WHERE library_id NOT IN (SELECT id FROM libraries);
   
   -- Fix duplicate ISBNs
   UPDATE books SET isbn = NULL 
   WHERE id NOT IN (
     SELECT MIN(id) FROM books 
     WHERE isbn IS NOT NULL 
     GROUP BY isbn
   );
   ```

2. **Restore from Backup:**
   ```bash
   # Stop application
   sudo systemctl stop booklore
   
   # Restore database
   psql $DATABASE_URL < /path/to/backup.sql
   
   # Start application
   sudo systemctl start booklore
   ```

## 📁 File Processing Issues

### Upload Failures

**Symptoms:**
- File upload timeouts
- "File too large" errors
- Unsupported format errors

**Diagnosis:**
```bash
# Check upload directory permissions
ls -la /var/lib/booklore/storage/

# Check disk space
df -h /var/lib/booklore/

# Check file size limits
grep -r "maxFileSize" src/

# Check supported formats
grep -r "ALLOWED_FILE_TYPES" .env
```

**Solutions:**

1. **Increase File Size Limits:**
   ```bash
   # Update .env
   echo "MAX_FILE_SIZE=500MB" >> .env
   
   # Update Nginx (if used)
   sudo nano /etc/nginx/sites-available/booklore
   # Add: client_max_body_size 500M;
   
   sudo systemctl reload nginx
   ```

2. **Fix Storage Permissions:**
   ```bash
   sudo chown -R booklore:booklore /var/lib/booklore/storage/
   sudo chmod -R 755 /var/lib/booklore/storage/
   ```

### Processing Failures

**Symptoms:**
- Books stuck in "PROCESSING" status
- Parser errors
- Queue job failures

**Diagnosis:**
```bash
# Check queue status
curl http://localhost:3000/api/v1/queue/status

# Check failed jobs
redis-cli LLEN bull:parse:failed

# Check processing logs
sudo journalctl -u booklore | grep -i "processing\|parser\|epub\|pdf"

# Check book status
psql $DATABASE_URL -c "
SELECT status, COUNT(*) 
FROM books 
GROUP BY status;"
```

**Solutions:**

1. **Restart Queue Workers:**
   ```bash
   # Clear failed jobs
   redis-cli DEL bull:parse:failed
   
   # Restart application
   sudo systemctl restart booklore
   ```

2. **Reprocess Failed Books:**
   ```sql
   -- Reset stuck books
   UPDATE books 
   SET status = 'PENDING', error = NULL 
   WHERE status = 'PROCESSING' 
   AND updated_at < NOW() - INTERVAL '1 hour';
   ```

### File Corruption

**Symptoms:**
- Parser crashes
- Incomplete file extraction
- Corrupted cover images

**Diagnosis:**
```bash
# Check file integrity
file /var/lib/booklore/storage/books/book.epub

# Test EPUB files
unzip -t /var/lib/booklore/storage/books/book.epub

# Test PDF files
pdfinfo /var/lib/booklore/storage/books/book.pdf

# Check file sizes
find /var/lib/booklore/storage/ -name "*.epub" -size 0
```

**Solutions:**

1. **Re-upload Corrupted Files:**
   ```bash
   # Remove corrupted file
   rm /var/lib/booklore/storage/books/corrupted.epub
   
   # Update database
   psql $DATABASE_URL -c "
   UPDATE books 
   SET status = 'FAILED', error = 'File corrupted' 
   WHERE file_path = '/path/to/corrupted.epub';"
   ```

2. **Validate Uploads:**
   ```bash
   # Add file validation script
   cat > validate_uploads.sh << 'EOF'
   #!/bin/bash
   for file in /var/lib/booklore/storage/books/*; do
     if ! file "$file" | grep -q "Zip archive"; then
       echo "Corrupted file: $file"
     fi
   done
   EOF
   
   chmod +x validate_uploads.sh
   ./validate_uploads.sh
   ```

## 🔐 Authentication Issues

### JWT Token Problems

**Symptoms:**
- "Invalid token" errors
- Token expiration issues
- Authentication failures

**Diagnosis:**
```bash
# Decode JWT token (without verification)
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." | cut -d. -f2 | base64 -d | jq

# Check token expiration
node -e "
const token = 'your-jwt-token';
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64'));
console.log('Expires:', new Date(payload.exp * 1000));
console.log('Now:', new Date());
"

# Test authentication
curl -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3000/api/v1/auth/profile
```

**Solutions:**

1. **Token Refresh:**
   ```bash
   # Get new token
   curl -X POST http://localhost:3000/api/v1/auth/refresh \
     -H "Content-Type: application/json" \
     -d '{"refresh_token": "your-refresh-token"}'
   ```

2. **Check JWT Secret:**
   ```bash
   # Verify JWT_SECRET is set
   echo $JWT_SECRET
   
   # Generate new secret if needed
   openssl rand -base64 32
   ```

### Session Issues

**Symptoms:**
- Frequent logouts
- Session not persisting
- Cross-device sync issues

**Diagnosis:**
```bash
# Check Redis session storage
redis-cli KEYS "sess:*"

# Check session expiration
redis-cli TTL "sess:session-id"

# Check cookie settings
curl -I http://localhost:3000/api/v1/auth/login
```

**Solutions:**

1. **Session Configuration:**
   ```bash
   # Update session settings
   echo "SESSION_TIMEOUT=86400" >> .env  # 24 hours
   echo "COOKIE_SECURE=false" >> .env    # For development
   ```

2. **Clear Sessions:**
   ```bash
   # Clear all sessions
   redis-cli EVAL "return redis.call('del', unpack(redis.call('keys', 'sess:*')))" 0
   ```

## ⚡ Performance Issues

### High CPU Usage

**Symptoms:**
- CPU usage consistently above 80%
- Slow response times
- System becomes unresponsive

**Diagnosis:**
```bash
# Monitor CPU usage
top -p $(pgrep node)

# Profile Node.js application
node --prof dist/main.js

# Analyze profile
node --prof-process isolate-*.log > profile.txt

# Check for CPU-intensive operations
sudo perf top -p $(pgrep node)
```

**Solutions:**

1. **Optimize Code:**
   ```bash
   # Enable production optimizations
   export NODE_ENV=production
   
   # Use cluster mode
   export CLUSTER_MODE=true
   export CLUSTER_WORKERS=4
   ```

2. **Resource Limits:**
   ```bash
   # Set CPU limits (systemd)
   sudo systemctl edit booklore
   
   # Add:
   [Service]
   CPUQuota=200%
   ```

### Memory Leaks

**Symptoms:**
- Memory usage continuously increasing
- Out of memory errors
- Application crashes

**Diagnosis:**
```bash
# Monitor memory usage
ps aux | grep node | awk '{print $4, $6, $11}'

# Generate heap snapshot
kill -USR2 $(pgrep node)

# Analyze heap dump
node --inspect dist/main.js
# Then use Chrome DevTools
```

**Solutions:**

1. **Memory Optimization:**
   ```bash
   # Increase heap size
   export NODE_OPTIONS="--max-old-space-size=4096"
   
   # Enable garbage collection optimization
   export NODE_OPTIONS="$NODE_OPTIONS --optimize-for-size"
   ```

2. **Memory Monitoring:**
   ```bash
   # Enable memory monitoring
   export ENABLE_MEMORY_MONITORING=true
   export MEMORY_THRESHOLD_MB=2048
   ```

### Database Performance

**Symptoms:**
- Slow query execution
- High database CPU usage
- Connection pool exhaustion

**Diagnosis:**
```sql
-- Check slow queries
SELECT query, calls, total_time, mean_time, rows
FROM pg_stat_statements 
WHERE calls > 100
ORDER BY mean_time DESC 
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats 
WHERE schemaname = 'public'
ORDER BY n_distinct DESC;

-- Check connection usage
SELECT count(*) as connections, state
FROM pg_stat_activity 
GROUP BY state;
```

**Solutions:**

1. **Query Optimization:**
   ```sql
   -- Add missing indexes
   CREATE INDEX CONCURRENTLY idx_books_library_id ON books(library_id);
   CREATE INDEX CONCURRENTLY idx_books_status ON books(status);
   CREATE INDEX CONCURRENTLY idx_books_created_at ON books(created_at);
   
   -- Update statistics
   ANALYZE;
   ```

2. **Connection Pool Tuning:**
   ```bash
   # Increase pool size
   echo "DATABASE_POOL_SIZE=30" >> .env
   
   # Configure PostgreSQL
   sudo nano /etc/postgresql/15/main/postgresql.conf
   # shared_buffers = 256MB
   # effective_cache_size = 1GB
   # work_mem = 4MB
   ```

## 🌐 Network & Connectivity

### API Timeouts

**Symptoms:**
- Request timeouts
- Connection refused errors
- Intermittent connectivity issues

**Diagnosis:**
```bash
# Test connectivity
curl -v http://localhost:3000/health

# Check network latency
ping localhost

# Check port accessibility
telnet localhost 3000

# Monitor network connections
netstat -an | grep :3000
```

**Solutions:**

1. **Timeout Configuration:**
   ```bash
   # Increase timeouts
   echo "REQUEST_TIMEOUT=30000" >> .env
   echo "KEEP_ALIVE_TIMEOUT=65000" >> .env
   ```

2. **Load Balancer Configuration:**
   ```nginx
   # Nginx timeout settings
   proxy_connect_timeout 60s;
   proxy_send_timeout 60s;
   proxy_read_timeout 60s;
   ```

### CORS Issues

**Symptoms:**
- Cross-origin request blocked
- Preflight request failures
- Browser console errors

**Diagnosis:**
```bash
# Test CORS headers
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     http://localhost:3000/api/v1/books

# Check CORS configuration
grep -r "CORS_ORIGIN" .env
```

**Solutions:**

1. **Update CORS Settings:**
   ```bash
   # Allow specific origins
   echo "CORS_ORIGIN=http://localhost:3000,https://yourdomain.com" >> .env
   
   # Or allow all origins (development only)
   echo "CORS_ORIGIN=*" >> .env
   ```

## 💾 Storage Issues

### Disk Space

**Symptoms:**
- "No space left on device" errors
- Upload failures
- Application crashes

**Diagnosis:**
```bash
# Check disk usage
df -h

# Check storage directory
du -sh /var/lib/booklore/storage/

# Find large files
find /var/lib/booklore/ -type f -size +100M -exec ls -lh {} \;

# Check inode usage
df -i
```

**Solutions:**

1. **Clean Up Storage:**
   ```bash
   # Remove old temporary files
   find /var/lib/booklore/storage/temp/ -mtime +7 -delete
   
   # Clean up failed uploads
   find /var/lib/booklore/storage/uploads/ -name "*.tmp" -delete
   
   # Compress old logs
   gzip /var/lib/booklore/logs/*.log
   ```

2. **Implement Storage Rotation:**
   ```bash
   # Create cleanup script
   cat > cleanup_storage.sh << 'EOF'
   #!/bin/bash
   # Remove files older than 30 days from temp
   find /var/lib/booklore/storage/temp/ -mtime +30 -delete
   
   # Compress logs older than 7 days
   find /var/lib/booklore/logs/ -name "*.log" -mtime +7 -exec gzip {} \;
   
   # Remove compressed logs older than 90 days
   find /var/lib/booklore/logs/ -name "*.gz" -mtime +90 -delete
   EOF
   
   chmod +x cleanup_storage.sh
   
   # Add to crontab
   echo "0 2 * * * /path/to/cleanup_storage.sh" | crontab -
   ```

### File Permissions

**Symptoms:**
- Permission denied errors
- Unable to write files
- Upload failures

**Diagnosis:**
```bash
# Check permissions
ls -la /var/lib/booklore/

# Check ownership
stat /var/lib/booklore/storage/

# Check process user
ps aux | grep node | head -1
```

**Solutions:**

1. **Fix Permissions:**
   ```bash
   # Fix ownership
   sudo chown -R booklore:booklore /var/lib/booklore/
   
   # Fix permissions
   sudo chmod -R 755 /var/lib/booklore/
   sudo chmod -R 644 /var/lib/booklore/storage/books/
   ```

## 📧 Email Issues

### SMTP Connection Failures

**Symptoms:**
- Email sending failures
- SMTP authentication errors
- Connection timeout errors

**Diagnosis:**
```bash
# Test SMTP connection
telnet smtp.gmail.com 587

# Check email configuration
grep -E "SMTP_" .env

# Test email sending
curl -X POST http://localhost:3000/api/v1/email/test \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Solutions:**

1. **SMTP Configuration:**
   ```bash
   # Update SMTP settings
   echo "SMTP_HOST=smtp.gmail.com" >> .env
   echo "SMTP_PORT=587" >> .env
   echo "SMTP_SECURE=false" >> .env
   echo "SMTP_USER=your-email@gmail.com" >> .env
   echo "SMTP_PASS=your-app-password" >> .env
   ```

2. **Authentication Issues:**
   ```bash
   # For Gmail, use App Password instead of regular password
   # Enable 2FA and generate App Password at:
   # https://myaccount.google.com/apppasswords
   ```

### Email Queue Issues

**Symptoms:**
- Emails not being sent
- Queue backlog
- Processing delays

**Diagnosis:**
```bash
# Check email queue
redis-cli LLEN bull:email:waiting
redis-cli LLEN bull:email:failed

# Check queue processing
curl http://localhost:3000/api/v1/queue/email/status
```

**Solutions:**

1. **Clear Queue:**
   ```bash
   # Clear failed jobs
   redis-cli DEL bull:email:failed
   
   # Restart queue processing
   sudo systemctl restart booklore
   ```

## 🔌 WebSocket Issues

### Connection Problems

**Symptoms:**
- WebSocket connection failures
- Real-time updates not working
- Connection drops frequently

**Diagnosis:**
```bash
# Test WebSocket connection
wscat -c ws://localhost:3000/socket.io/?EIO=4&transport=websocket

# Check WebSocket logs
sudo journalctl -u booklore | grep -i websocket

# Monitor connections
netstat -an | grep :3000 | grep ESTABLISHED
```

**Solutions:**

1. **WebSocket Configuration:**
   ```bash
   # Enable WebSocket support in Nginx
   sudo nano /etc/nginx/sites-available/booklore
   
   # Add WebSocket proxy configuration:
   location /socket.io/ {
     proxy_pass http://127.0.0.1:3000;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
   }
   ```

2. **Firewall Issues:**
   ```bash
   # Check firewall rules
   sudo ufw status
   
   # Allow WebSocket port
   sudo ufw allow 3000
   ```

## 🚀 Deployment Issues

### Docker Problems

**Symptoms:**
- Container won't start
- Build failures
- Runtime errors

**Diagnosis:**
```bash
# Check container status
docker ps -a

# View container logs
docker logs booklore-api

# Check image
docker images | grep booklore

# Inspect container
docker inspect booklore-api
```

**Solutions:**

1. **Build Issues:**
   ```bash
   # Clean build
   docker system prune -a
   docker build --no-cache -t booklore-api .
   ```

2. **Runtime Issues:**
   ```bash
   # Check environment variables
   docker exec booklore-api env | grep -E "(DATABASE_URL|NODE_ENV)"
   
   # Debug container
   docker run -it --entrypoint /bin/sh booklore-api
   ```

### Kubernetes Issues

**Symptoms:**
- Pods not starting
- Service unavailable
- Resource constraints

**Diagnosis:**
```bash
# Check pod status
kubectl get pods -n booklore

# View pod logs
kubectl logs -f deployment/booklore-api -n booklore

# Describe pod
kubectl describe pod <pod-name> -n booklore

# Check events
kubectl get events -n booklore --sort-by='.lastTimestamp'
```

**Solutions:**

1. **Resource Issues:**
   ```yaml
   # Increase resource limits
   resources:
     requests:
       memory: "1Gi"
       cpu: "500m"
     limits:
       memory: "2Gi"
       cpu: "1000m"
   ```

2. **Configuration Issues:**
   ```bash
   # Check ConfigMap
   kubectl get configmap booklore-config -n booklore -o yaml
   
   # Check Secrets
   kubectl get secret booklore-secrets -n booklore -o yaml
   ```

## 📊 Monitoring & Logging

### Log Analysis

**Common Log Patterns:**

```bash
# Error patterns
sudo journalctl -u booklore | grep -E "(ERROR|FATAL|Exception)"

# Performance patterns
sudo journalctl -u booklore | grep -E "(slow|timeout|memory)"

# Authentication patterns
sudo journalctl -u booklore | grep -E "(auth|login|token)"

# Database patterns
sudo journalctl -u booklore | grep -E "(database|connection|query)"
```

### Metrics Collection

```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Monitor key metrics
curl -s http://localhost:3000/metrics | grep -E "(http_requests|memory_usage|database_connections)"

# Set up monitoring alerts
# Configure Prometheus/Grafana for production monitoring
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG=booklore:*
export LOG_LEVEL=debug

# Restart with debug mode
sudo systemctl restart booklore

# Monitor debug logs
sudo journalctl -u booklore -f | grep DEBUG
```

## 🆘 Emergency Procedures

### Service Recovery

```bash
# Quick service restart
sudo systemctl restart booklore

# Full system restart (if needed)
sudo systemctl restart postgresql redis nginx booklore

# Check all services
sudo systemctl status postgresql redis nginx booklore
```

### Database Recovery

```bash
# Stop application
sudo systemctl stop booklore

# Backup current state
pg_dump $DATABASE_URL > emergency_backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
psql $DATABASE_URL < /path/to/backup.sql

# Start application
sudo systemctl start booklore
```

### Contact Support

If you can't resolve the issue:

1. **Gather Information:**
   ```bash
   # Create support bundle
   mkdir support_bundle_$(date +%Y%m%d_%H%M%S)
   cd support_bundle_*
   
   # System info
   uname -a > system_info.txt
   free -h > memory_info.txt
   df -h > disk_info.txt
   
   # Application logs
   sudo journalctl -u booklore --since "1 hour ago" > app_logs.txt
   
   # Configuration (remove sensitive data)
   grep -v -E "(PASSWORD|SECRET|KEY)" /path/to/.env > config.txt
   
   # Create archive
   cd ..
   tar -czf support_bundle_$(date +%Y%m%d_%H%M%S).tar.gz support_bundle_*
   ```

2. **Contact Channels:**
   - GitHub Issues: https://github.com/booklore-app/booklore-node/issues
   - Email: support@booklore.app
   - Documentation: http://localhost:3000/api/docs

Include the support bundle and a clear description of:
- What you were trying to do
- What happened instead
- Steps to reproduce the issue
- Your environment details

This troubleshooting guide covers the most common issues. For specific problems not covered here, check the application logs and contact support with detailed information about your issue.