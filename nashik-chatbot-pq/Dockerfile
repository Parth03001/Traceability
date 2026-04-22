# Multi-stage Dockerfile for Thar Roxx Quality Intelligence API

# Stage 1: Build React Frontend
# Using Node 20 LTS for better stability and compatibility
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
# Using npm install instead of npm ci for better compatibility with different Node versions
# The lock file may be generated with different Node versions locally
RUN npm install --legacy-peer-deps --production=false

# Copy frontend source code
COPY frontend/ ./

# Debug: List files to verify structure
RUN ls -la && ls -la src/ && ls -la src/assests/ && ls -la src/components/

# Build React application
RUN npm run build

# Stage 2: Python Backend with Frontend Build
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Python requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY tasks.py .
COPY app/ ./app/
COPY backend/ ./backend/
COPY dataloader/ ./dataloader/
COPY scripts/ ./scripts/

# Copy frontend build from stage 1
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Create directory for logs
RUN mkdir -p /app/logs

# Expose application port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/health')" || exit 1

# Run the application
CMD ["python", "main.py"]
