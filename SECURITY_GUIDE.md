# 🛡️ PKMS Security Guide

## 📋 Security Implementation Status

### ✅ **Security Features Implemented**

#### **Authentication & Authorization**
- [x] Industry-standard bcrypt password hashing (no redundant salting)
- [x] JWT access tokens with 30-minute expiry
- [x] HttpOnly refresh cookies with 7-day sliding expiry
- [x] Session management with automatic cleanup
- [x] Password strength validation (8+ chars, mixed case, numbers, symbols)
- [x] Security question-based password recovery
- [x] Rate limiting on authentication endpoints (3/min setup, 5/min login)

#### **Input Validation & Sanitization**
- [x] Comprehensive Pydantic validation with regex patterns
- [x] Username sanitization and blacklist protection
- [x] Password security validation against unsafe characters
- [x] Security question/answer validation
- [x] Field length limits and type validation

#### **Security Headers & Middleware**
- [x] X-Frame-Options: DENY (clickjacking protection)
- [x] X-Content-Type-Options: nosniff (MIME sniffing protection)
- [x] X-XSS-Protection: 1; mode=block (XSS protection)
- [x] Referrer-Policy: strict-origin-when-cross-origin
- [x] Content-Security-Policy (production only)
- [x] Strict-Transport-Security (HTTPS/production only)
- [x] Trusted Host middleware for production

#### **Session Security**
- [x] Automatic expired session cleanup (24-hour intervals)
- [x] Session token rotation on refresh
- [x] IP address and User-Agent logging
- [x] Session expiry warnings in frontend
- [x] Automatic logout on token expiry

#### **Environment Security**
- [x] Required SECRET_KEY via environment variables in production
- [x] Debug mode secrets never logged in production
- [x] Secure default configurations
- [x] Environment-based security settings

#### **Error Handling**
- [x] Secure error messages (no information leakage)
- [x] Generic authentication failure messages
- [x] Structured logging for security events
- [x] User-friendly error notifications

## 🔧 Security Configuration

### **Environment Variables (.env)**

```bash
# CRITICAL SECURITY SETTINGS - REQUIRED FOR PRODUCTION
SECRET_KEY=generate-using-python-secrets-token-urlsafe-32
ENVIRONMENT=production
DEBUG=false

# Database Configuration
DATABASE_URL=sqlite+aiosqlite:///./data/pkm_metadata.db

# Server Configuration
HOST=127.0.0.1  # Bind to localhost only
PORT=8000
LOG_LEVEL=info

# Security Settings
ENABLE_SECURITY_HEADERS=true
SESSION_CLEANUP_INTERVAL_HOURS=24
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_LIFETIME_DAYS=7
PASSWORD_MIN_LENGTH=8

# File Storage Security
MAX_FILE_SIZE=52428800  # 50MB
DATA_DIR=./data

# CORS Configuration (Adjust for your domain)
CORS_ORIGINS=["https://your-domain.com"]
```

### **Generate Secure Keys**

```bash
# Generate SECRET_KEY
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(32))"

# Generate database encryption key (if using SQLCipher)
python -c "import secrets; print('DB_KEY=' + secrets.token_hex(32))"

# Generate backup password
python -c "import secrets; print('BACKUP_PASSWORD=' + secrets.token_urlsafe(16))"
```

## 🚀 Production Deployment Security

### **1. HTTPS Configuration (Nginx)**

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Configuration
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Content Security Policy
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'" always;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Security timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### **2. Database Security**

#### **SQLite Encryption (SQLCipher)**
```python
# Install SQLCipher
pip install sqlcipher3

# Connection with encryption
DATABASE_URL = "sqlite+aiosqlite:///./data/pkm_metadata.db?cipher=aes-256-cbc&key=your-encryption-key"
```

#### **Database Backup with Encryption**
```bash
#!/bin/bash
# backup-script.sh

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backup_${TIMESTAMP}.db.enc"
SOURCE_DB="./PKMS_Data/pkm_metadata.db"

# Create encrypted backup
openssl enc -aes-256-cbc -salt \
    -in "$SOURCE_DB" \
    -out "./PKMS_Data/backups/$BACKUP_FILE" \
    -k "$BACKUP_PASSWORD"

echo "✅ Encrypted backup created: $BACKUP_FILE"

# Clean old backups (keep last 30 days)
find ./PKMS_Data/backups/ -name "backup_*.db.enc" -mtime +30 -delete
```

### **3. File System Security**

```bash
# Set secure permissions
chmod 700 ./PKMS_Data/
chmod 600 ./PKMS_Data/pkm_metadata.db
chmod 700 ./PKMS_Data/secure/
chmod 600 ./PKMS_Data/secure/*

# Create dedicated user (Linux)
sudo useradd -r -s /bin/false pkms
sudo chown -R pkms:pkms ./PKMS_Data/
```

## 📊 Security Monitoring

### **1. Security Event Logging**

```python
import structlog
from datetime import datetime

logger = structlog.get_logger()

# Log authentication events
async def log_auth_event(event_type: str, username: str, ip: str, success: bool):
    logger.info(
        "auth_event",
        event_type=event_type,
        username=username,
        ip_address=ip,
        success=success,
        timestamp=datetime.utcnow().isoformat()
    )

# Usage in endpoints
@router.post("/login")
async def login(user_data: UserLogin, request: Request):
    try:
        # Login logic
        await log_auth_event("login", user_data.username, request.client.host, True)
    except HTTPException:
        await log_auth_event("login", user_data.username, request.client.host, False)
        raise
```

### **2. Security Monitoring Script**

```python
#!/usr/bin/env python3
# security_monitor.py

import sqlite3
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText

def check_failed_logins():
    """Monitor for suspicious login attempts"""
    # Check database for failed logins in last hour
    conn = sqlite3.connect('./PKMS_Data/pkm_metadata.db')
    cursor = conn.cursor()
    
    # This would require adding a failed_attempts table
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    
    cursor.execute("""
        SELECT ip_address, COUNT(*) as attempts 
        FROM failed_login_attempts 
        WHERE created_at > ? 
        GROUP BY ip_address 
        HAVING attempts > 10
    """, (one_hour_ago,))
    
    suspicious_ips = cursor.fetchall()
    
    if suspicious_ips:
        send_security_alert(f"Suspicious login attempts from: {suspicious_ips}")
    
    conn.close()

def send_security_alert(message: str):
    """Send security alert email"""
    # Configure email settings
    pass

if __name__ == "__main__":
    check_failed_logins()
```

## 🔍 Security Audit Checklist

### **Pre-Production Checklist**

#### **Backend Security**
- [ ] SECRET_KEY set via environment variable (not hardcoded)
- [ ] DEBUG=false in production
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Security headers middleware active
- [ ] Rate limiting configured on all endpoints
- [ ] Input validation implemented on all user inputs
- [ ] Session cleanup task running
- [ ] Database backups encrypted and tested
- [ ] Log files secured with appropriate permissions
- [ ] Dependencies updated to latest secure versions
- [ ] SQL injection protection verified (parameterized queries)
- [ ] XSS protection implemented (input sanitization + CSP)
- [ ] CSRF protection configured (SameSite cookies)

#### **Frontend Security**
- [ ] Content Security Policy headers implemented
- [ ] XSS protection through input sanitization
- [ ] Secure token storage (localStorage for desktop app)
- [ ] Session expiry warnings functional
- [ ] Automatic logout on token expiry working
- [ ] Error handling doesn't leak sensitive information
- [ ] HTTPS-only cookie settings in production

#### **Infrastructure Security**
- [ ] Server hardened (unnecessary services disabled)
- [ ] Firewall configured (only necessary ports open)
- [ ] SSH key-based authentication (passwords disabled)
- [ ] Regular security updates scheduled
- [ ] Backup strategy tested and documented
- [ ] Monitoring and alerting configured
- [ ] SSL/TLS configuration tested (A+ rating)

## 🚨 Security Incident Response

### **1. Suspected Breach Response**

```bash
# Immediate actions
1. Change all passwords and secrets
2. Revoke all active sessions
3. Enable additional logging
4. Check for data integrity
5. Notify users if required

# Investigation
1. Check access logs for suspicious activity
2. Verify database integrity
3. Check for unauthorized file access
4. Review system logs for anomalies
```

### **2. Emergency Commands**

```python
# Revoke all sessions (emergency)
async def emergency_revoke_all_sessions():
    async with get_db_session() as db:
        await db.execute(delete(Session))
        await db.commit()
    print("🚨 All sessions revoked")

# Change SECRET_KEY (requires restart)
# 1. Generate new key: python -c "import secrets; print(secrets.token_urlsafe(32))"
# 2. Update environment variable
# 3. Restart application
```

## 📚 Security Resources

### **Security Standards Compliance**
- ✅ OWASP Top 10 Web Application Security Risks
- ✅ NIST Cybersecurity Framework
- ✅ CIS Security Controls
- ✅ ISO 27001 Information Security Management

### **Regular Security Tasks**
- [ ] Monthly dependency updates
- [ ] Quarterly security audits
- [ ] Annual penetration testing
- [ ] Regular backup testing
- [ ] Security awareness training

### **Tools for Security Testing**
- **OWASP ZAP**: Web application security scanner
- **SQLMap**: SQL injection testing
- **Bandit**: Python security linter
- **Safety**: Python dependency vulnerability scanner
- **Semgrep**: Static analysis security scanner

---

**⚠️ Important: This security guide should be reviewed and updated regularly as new threats emerge and the application evolves.** 