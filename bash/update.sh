#! /bin/bash
# script for fast updating to any version on server

VERSION_NUMBER=

echo "Enter version number (leave empty for latest version):"
read VERSION_NUMBER

git checkout .
git fetch --all

if [[ $VERSION_NUMBER = '' ]]
then
    git checkout master
    VERSION_NUMBER=`sed -n "s/^  \"version\": \"\([^\"]\+\)\",$/\1/p" package.json`
fi

git checkout $VERSION_NUMBER

sed -i "s/\"dist\/xabber\.min\.js?v[^\"]\+/\"dist\/xabber\.min\.js?v${VERSION_NUMBER}/g" *.html
sed -i "s/\"dist\/xabber\.min\.css?v[^\"]\+/\"dist\/xabber\.min\.css?v${VERSION_NUMBER}/g" *.html

git checkout example_index.html
