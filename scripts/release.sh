#!/usr/bin/env sh
# Cuts a release: pins the deploy templates to the new version, commits,
# tags vX.Y.Z and pushes both. The tag push triggers the Docker workflow,
# which builds and publishes the image the templates now point at.
#
# Usage: pnpm release 1.4.0
set -eu

version="${1:-}"
echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || {
  echo "Usage: pnpm release X.Y.Z" >&2
  exit 1
}
tag="v$version"

cd "$(git rev-parse --show-toplevel)"

[ "$(git branch --show-current)" = "main" ] || { echo "Not on main." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Working tree not clean." >&2; exit 1; }
git fetch --quiet origin main --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || {
  echo "main is not in sync with origin/main." >&2
  exit 1
}
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "Tag $tag already exists." >&2
  exit 1
fi

# Every file that pins the image version. Keep in sync with deploy/README.md.
image_files="render.yaml deploy/dokploy/alphorn/docker-compose.yml deploy/coolify/alphorn.yaml"
for f in $image_files; do
  sed -i.bak -E "s#(ghcr\.io/alphorn-dev/alphorn:)[0-9]+\.[0-9]+\.[0-9]+#\1$version#" "$f"
  rm "$f.bak"
done
sed -i.bak -E "s#(\"version\": \")[0-9]+\.[0-9]+\.[0-9]+#\1$version#" deploy/dokploy/alphorn/meta.json
rm deploy/dokploy/alphorn/meta.json.bak

git --no-pager diff --stat
printf "Commit, tag %s and push to origin? [y/N] " "$tag"
read -r answer
if [ "$answer" != "y" ]; then
  git checkout -- $image_files deploy/dokploy/alphorn/meta.json
  echo "Aborted, changes reverted."
  exit 1
fi

git commit --quiet -am "chore: release $tag"
git tag -a "$tag" -m "$tag"
git push --quiet --atomic origin main "$tag"

echo "Released $tag. Remaining manual step: update the image tag in the Railway template."
