#!/usr/bin/env bash
# Deploys the platform (controller + gateway) into the current Kubernetes cluster (Docker Desktop).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Context: $(kubectl config current-context)"
nodes="$(kubectl get nodes --no-headers 2>/dev/null || true)"
if [ -z "$nodes" ]; then
  echo "Cluster is not reachable. Docker Desktop -> Settings -> Kubernetes -> Enable Kubernetes (kind mode, 3 nodes)." >&2
  exit 1
fi
echo "$nodes"
if [ "$(printf '%s\n' "$nodes" | wc -l)" -lt 2 ]; then
  echo "WARNING: only one node: pods will not be spread across nodes. Use kind mode with 3 nodes in Docker Desktop." >&2
fi

kubectl apply -k .
# the code lives in ConfigMaps: restart the platform and drop old site pods so they pick up fresh code
kubectl -n deploy-playground rollout restart deployment/platform
kubectl -n deploy-playground delete deployment,service -l managed-by=deploy-playground --ignore-not-found
kubectl -n deploy-playground rollout status deployment/platform --timeout=180s
echo
echo "Done. Next: npm run cluster:forward (separate terminal), then npm run dev"
