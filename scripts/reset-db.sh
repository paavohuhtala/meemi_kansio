#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"
sqlx database reset -y
echo "Database reset complete."
