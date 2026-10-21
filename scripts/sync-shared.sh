#!/usr/bin/env bash
# Copies backend/_shared into every service folder (backend/auth/_shared, ...).
#
# Why: locally, LocalStack runs each Lambda straight from its own folder (hot reload,
# see infra/lambda.tf), so the shared code has to be inside that folder too. In AWS the
# deploy adds _shared to each zip by itself, so this is only needed for local runs.
#
# Run it after changing anything in backend/_shared. The copies are not committed
# (backend/.gitignore).
set -e

BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"

for req in "$BACKEND_DIR"/*/requirements.txt; do
    service_dir="$(dirname "$req")"
    name="$(basename "$service_dir")"
    case "$name" in _*|.*) continue ;; esac

    rm -rf "$service_dir/_shared"
    cp -r "$BACKEND_DIR/_shared" "$service_dir/_shared"
    find "$service_dir/_shared" -name __pycache__ -prune -exec rm -rf {} +
    echo "Copied _shared into $name"
done
