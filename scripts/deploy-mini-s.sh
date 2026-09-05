#!/usr/bin/env bash
# Deploy / update the Azul stack on azul-server (192.168.1.219).
#
# Run ON the box, or from the laptop:
#   ssh mitchellch@192.168.1.219 'bash -s' < scripts/deploy-mini-s.sh
#
# Assumes first-time bootstrap is already done (Docker, Node 22 via NodeSource,
# repo cloned to $AZUL_REPO, server/.env + web/.env in place, systemd units
# from deploy/ installed and enabled). See docs/design/home-server-hosting-plan.md.
set -euo pipefail

REPO="${AZUL_REPO:-/home/mitchellch/azul}"
cd "$REPO"

echo "== Pulling latest main =="
git fetch --all
git checkout main
git pull --ff-only

echo "== Infra: Postgres + Mosquitto (Docker) =="
cd "$REPO/server"
docker compose up -d

echo "== API build =="
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
mkdir -p uploads/firmware uploads/zones   # persistent upload dirs

echo "== Web build =="
cd "$REPO/web"
npm ci
npm run build

echo "== Restart services =="
sudo systemctl restart azul-server azul-web
sleep 2
sudo systemctl --no-pager --lines=5 status azul-server azul-web || true

echo "== Smoke test =="
curl -fsS http://localhost:3000/health && echo "  <- API OK"
echo "Done. Web: http://192.168.1.219:3001  API: http://192.168.1.219:3000"
