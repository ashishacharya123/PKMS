# Multi-stage build for optimized production image
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies (production only)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Final stage - use alpine for smaller size
FROM python:3.11-alpine

# Install runtime dependencies (minimal)
RUN apk add --no-cache \
    curl \
    tzdata \
    && rm -rf /var/cache/apk/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user
RUN adduser -D -u 1000 pkms

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R pkms:pkms /app/data

# Set working directory
WORKDIR /app

# Copy application code
COPY --chown=pkms:pkms . .

# Set timezone to Asia/Kathmandu
ENV TZ=Asia/Kathmandu

# Switch to non-root user
USER pkms

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Set default command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"] 