#!/usr/bin/env bash
# Removes everything the platform created (the whole deploy-playground namespace).
set -euo pipefail
kubectl delete namespace deploy-playground --ignore-not-found
