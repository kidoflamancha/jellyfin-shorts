#!/usr/bin/env bash
set -e

# ==========================================
# Jellyfin Shorts Plugin Deployment Template
# ==========================================
# Replace placeholder variables with your own server environment details

HOST="user@your-server-ip"
REMOTE_PLUGIN_DIR="/opt/appdata/jellyfin/config/plugins/Shorts_1.0.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== 1. Building Jellyfin.Plugin.Shorts (Release) ==="
dotnet build -c Release "$SCRIPT_DIR/Jellyfin.Plugin.Shorts/Jellyfin.Plugin.Shorts.csproj"

echo "=== 2. Creating Remote Plugin Directory ==="
ssh $HOST "mkdir -p '$REMOTE_PLUGIN_DIR'"

echo "=== 3. Uploading Plugin DLL and Metadata ==="
scp "$SCRIPT_DIR/Jellyfin.Plugin.Shorts/bin/Release/net9.0/Jellyfin.Plugin.Shorts.dll" "$HOST:$REMOTE_PLUGIN_DIR/"
scp "$SCRIPT_DIR/Jellyfin.Plugin.Shorts/meta.json" "$HOST:$REMOTE_PLUGIN_DIR/"

echo "=== 4. Setting Correct Permissions & Cache Buster ==="
# Adjust ownership if your container runs under a non-root UID/GID (e.g. 1000:1000)
# ssh $HOST "chown -R 1000:1000 '$REMOTE_PLUGIN_DIR'"

# Optional: Refresh cache-busting timestamp in Jellyfin Web index.html if using web injection
VERSION_TAG="$(date +%Y%m%d_%H%M%S)"
# ssh $HOST "sed -i 's|/Shorts/web/shorts-inject.js[^\"'\''<]*|/Shorts/web/shorts-inject.js?v=$VERSION_TAG|g' /path/to/jellyfin-web/index.html"

echo "=== 5. Restarting Jellyfin Container ==="
ssh $HOST "docker restart jellyfin"

echo "=== Deployment Finished! Waiting for Jellyfin to start... ==="
sleep 8
ssh $HOST "curl -s -i http://localhost:8096/Shorts/Ping" || true
