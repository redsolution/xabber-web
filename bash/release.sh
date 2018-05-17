#! /bin/bash
# script for fast making new version from develop branch current state and save it to repository

CUR_VERSION_NUMBER=`sed -n "s/^  \"version\": \"\([^\"]\+\)\",$/\1/p" package.json`

VERSION_NUMBER=
VERSION_DESCRIPTION=

while [[ $VERSION_NUMBER = "" ]]; do
    echo "Enter new version number (current is ${CUR_VERSION_NUMBER}):"
    read VERSION_NUMBER
done

while [[ $VERSION_DESCRIPTION = "" ]]; do
    echo "Enter new version description:"
    read VERSION_DESCRIPTION
done

git checkout develop
GIT_RELEASE_BR=release/${VERSION_NUMBER}
git checkout -b ${GIT_RELEASE_BR}

sed -i "s/\"dist\/xabber\.min\.js?v[^\"]\+/\"dist\/xabber\.min\.js?v${VERSION_NUMBER}/g" example_index.html
sed -i "s/\"dist\/xabber\.min\.css?v[^\"]\+/\"dist\/xabber\.min\.css?v${VERSION_NUMBER}/g" example_index.html
sed -i "s/\"version\":\ \"[^\"]\+/\"version\":\ \"${VERSION_NUMBER}/g" bower.json package.json
sed -i "s/\"version_number\":\"[^\"]\+/\"version_number\":\"${VERSION_NUMBER}/g" version.js
sed -i "s/\"version_description\":\".*$/\"version_description\":\"${VERSION_DESCRIPTION}\"}'/g" version.js

make minify

git add .
git commit -m "Make version (${VERSION_NUMBER})"
git checkout master
git merge ${GIT_RELEASE_BR}
git branch -D ${GIT_RELEASE_BR}
git tag -a ${VERSION_NUMBER} -m "${VERSION_DESCRIPTION}"
git checkout develop
git merge master
