#! /usr/bin/env sh

read -p "Enter the version you want to publish: " version

git add .
git commit -m "v$version"
git tag "v$version"
git push --tags
npm publish
