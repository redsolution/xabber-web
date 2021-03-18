#! /bin/bash
# script for fast updating translations


cd ../../xabber-translations
git pull origin
cp -R ./values  ../xabber-web/translations
cd ../xabber-web/translations
node xml_to_json.js