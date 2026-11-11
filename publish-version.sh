#!/usr/bin/env bash
# Usage: ./publish-version.sh [release-notes.md]
set -euo pipefail

cd "$(dirname "$0")"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty, commit or stash first." >&2
  exit 1
fi

current=$(jq -r .version package.json)
read -rp "Version to publish (x.y.z, major, minor or patch; current $current): " input

IFS=. read -r major minor patch <<< "$current"
case "${input#v}" in
  major) version="$((major + 1)).0.0" ;;
  minor) version="$major.$((minor + 1)).0" ;;
  patch) version="$major.$minor.$((patch + 1))" ;;
  [0-9]*.[0-9]*.[0-9]*) version="${input#v}" ;;
  *) echo "Invalid version: $input" >&2; exit 1 ;;
esac
tag="v$version"

pnpm test

jq --arg v "$version" '.version = $v' package.json > package.json.tmp
mv package.json.tmp package.json
git commit -qm "$tag" package.json
git tag "$tag"

rm -rf dist
if ! pnpm publish --access public; then
  echo "Publish failed. Undo with: git tag -d $tag && git reset --hard HEAD~1" >&2
  exit 1
fi

git push origin HEAD "$tag"

if [[ $# -gt 0 ]]; then
  gh release create "$tag" --title "$tag" --notes-file "$1" --latest
else
  gh release create "$tag" --title "$tag" --generate-notes --latest
fi
