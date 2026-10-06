#!/usr/bin/env bash
# Forwards the platform to http://localhost:8080 (vite proxies /api and /i to it).
set -euo pipefail
exec kubectl -n deploy-playground port-forward svc/platform 8080:80
