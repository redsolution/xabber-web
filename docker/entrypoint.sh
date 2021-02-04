#!/bin/bash
echo 'Start Xabber WS Server...'
/app/xabber_ws/bin/xabber_ws start
echo 'Start Xabber WS Server - OK'

cd /app
cp ./example_index.html ./index.html

VARS=(
  CONNECTION_URL 
  LOG_LEVEL 
  DEBUG 
  XABBER_ACCOUNT_URL 
  API_SERVICE_URL 
  USE_SOCIAL_AUTH 
  DEFAULT_LOGIN_SCREEN 
  STORAGE_NAME_ENDING 
  TURN_SERVERS_LIST 
  DISABLE_LOOKUP_WS 
  REGISTER_XMPP_ACCOUNT
)
for var in ${VARS[@]}
do
  echo "Check $var in index.html"
  if [ -z ${!var+x} ]; then
    echo "$var is empty"
  else
    grep -q "$var" ./index.html
    if [[ $? -eq 0 ]]; then
      echo "Replace $var in index.html"
      sed  "s#$var.*#$var: ${!var},#" ./index.html > ./new_index.html && mv ./new_index.html ./index.html
    else
      echo "Add value var to index.html"
      sed  "s/xabber.configure({/a $var: ${!var}," ./index.html > ./new_index.html && mv ./new_index.html ./index.html
    fi
  fi
done

exec "$@"
