# Docker Image Optimization

## Problem
The PKMS Docker image was 1.5GB, which is unnecessarily large for a Python web application.

## Optimizations Made

### 1. Separated Production and Development Dependencies
- **Before**: Single `requirements.txt` with all dev/test dependencies
- **After**: 
  - `requirements.txt` - Production only (removed ~200MB of dev packages)
  - `requirements-dev.txt` - Development dependencies

**Removed from Production:**
- pytest, pytest-asyncio, pytest-cov, pytest-xdist (~50MB)
- httpx, factory-boy, faker (~30MB)
- black, flake8, mypy (~20MB)
- transformers, huggingface-hub (~100MB if uncommented)

### 2. Base Image Optimization
- **Before**: `python:3.11-slim` (~200MB)
- **After**: `python:3.11-alpine` (~50MB)

### 3. Removed Docker CLI Installation
- **Before**: Installed Docker CLI in container (~100MB)
- **After**: Removed Docker CLI (not needed for production)

### 4. Optimized System Dependencies
- **Before**: Full apt packages with Docker CLI
- **After**: Minimal Alpine packages (curl, tzdata only)

### 5. Multi-stage Build Optimization
- Builder stage: Install build dependencies
- Final stage: Copy only virtual environment and runtime dependencies

## File Structure

```
pkms-backend/
├── Dockerfile          # Production optimized (~300-400MB)
├── Dockerfile.dev      # Development with all deps (~1.2GB)
├── requirements.txt    # Production dependencies
└── requirements-dev.txt # Development dependencies
```

## Usage

### Production (Optimized)
```bash
docker-compose up --build
```

### Development (Full Features)
```bash
docker-compose -f docker-compose.dev.yml up --build
```

## Expected Results

- **Production Image**: ~300-400MB (70% reduction)
- **Development Image**: ~1.2GB (20% reduction due to better base image)

## Security Benefits

1. **Smaller Attack Surface**: Fewer packages = fewer vulnerabilities
2. **Non-root User**: Application runs as `pkms` user
3. **Minimal Dependencies**: Only essential packages installed
4. **Alpine Base**: Smaller, more secure base image

## Performance Benefits

1. **Faster Builds**: Less to download and install
2. **Faster Deployments**: Smaller images transfer faster
3. **Lower Resource Usage**: Less disk space and memory
4. **Better Caching**: Smaller layers cache more efficiently

## AI Agent: Claude Sonnet 4
**Date**: 2025-01-16
**Changes Made**: Docker optimization for image size reduction 