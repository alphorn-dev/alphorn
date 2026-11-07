#!/usr/bin/env sh
# Pushes README.md to the Docker Hub overview of alphorn/alphorn, without a
# release (the Docker workflow does the same on every release tag).
# Needs a Docker Hub token with the Read, Write, Delete scope.
#
# Usage (set credentials once per shell, then run as often as needed):
#   read -p "Docker Hub user: " DH_USER; read -s -p "Token: " DH_TOKEN; echo
#   export DH_USER DH_TOKEN
#   sh scripts/dockerhub-readme.sh
set -eu

: "${DH_USER:?set DH_USER first}"
: "${DH_TOKEN:?set DH_TOKEN first}"
repo="${DH_REPO:-alphorn/alphorn}"

cd "$(git rev-parse --show-toplevel)"

jwt=$(curl -s -X POST https://hub.docker.com/v2/users/login \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg u "$DH_USER" --arg p "$DH_TOKEN" '{username:$u,password:$p}')" | jq -r .token)
[ "$jwt" != "null" ] && [ -n "$jwt" ] || { echo "Docker Hub login failed." >&2; exit 1; }

# Relative links don't resolve on Docker Hub; point them at GitHub.
status=$(sed 's#](\./#](https://github.com/alphorn-dev/alphorn/blob/main/#g' README.md \
  | jq -Rs '{full_description: .}' \
  | curl -s -o /dev/null -w "%{http_code}" -X PATCH "https://hub.docker.com/v2/repositories/$repo/" \
      -H "Authorization: JWT $jwt" -H 'Content-Type: application/json' -d @-)

if [ "$status" = "200" ]; then
  echo "README updated on Docker Hub ($repo)."
else
  echo "Docker Hub returned HTTP $status (403: token needs Read, Write, Delete)." >&2
  exit 1
fi
