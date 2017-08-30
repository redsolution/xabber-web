#! /bin/bash

VERSION_NUMBER=
VERSION_DESCRIPTION=

while [[ $VERSION_NUMBER = "" ]]; do
    echo "Enter version number:"
    read VERSION_NUMBER
done

while [[ $VERSION_DESCRIPTION = "" ]]; do
    echo "Enter version description:"
    read VERSION_DESCRIPTION
done

git checkout develop
GIT_RELEASE_BR=release/${VERSION_NUMBER}
git checkout -b ${GIT_RELEASE_BR}

sed -i "s/\"dist\/xabber\.min\.css?v[^\"]\+/\"dist\/xabber\.min\.css?v${VERSION_NUMBER}/g" example_index.html
sed -i "s/\"version\":\ \"[^\"]\+/\"version\":\ \"${VERSION_NUMBER}/g" bower.json package.json
sed -i "s/\"version_number\":\"[^\"]\+/\"version_number\":\"${VERSION_NUMBER}/g" src/version.js
sed -i "s/\"version_description\":\".*$/\"version_description\":\"${VERSION_DESCRIPTION}\"}'/g" src/version.js

git add .
git commit -m "Make version (${VERSION_NUMBER})"
git checkout master
git merge ${GIT_RELEASE_BR}
git branch -D ${GIT_RELEASE_BR}
git tag -a ${VERSION_NUMBER} -m "${VERSION_DESCRIPTION}"
git checkout develop
git merge master
