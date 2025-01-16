#! /usr/bin/env sh

read -p "Enter the version you want to publish: " version

if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/\"version\": \".*\"/\"version\": \"$version\"/gi" ./package.json
else
  sed -i "s/\"version\": \".*\"/\"version\": \"$version\"/gi" ./package.json
fi

git add .

git commit -m "v$version"

git tag "v$version"

git push --tags

git push

npm publish
