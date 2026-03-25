#!/bin/bash
cd "$(dirname "$0")"

# Build frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
    echo "Building frontend..."
    cd frontend && npm run build && cd ..
fi

# Copy logo to frontend public
cp documentation/logo.png frontend/dist/logo.png 2>/dev/null || true

# Start server
echo "Starting Data Viewer on port ${PORT:-8080}..."
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}
