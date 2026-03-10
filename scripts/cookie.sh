#!/bin/bash

# IDP_HOST="http://idp-1.localhost:8080"
# IDP_HOST="https://fedcm-server.liquid.surf"
IDP_HOST="http://localhost:3000"
AUTH_ENDPOINT="${IDP_HOST}/.account/login/password/"
EMAIL=alice@example.org
PASSWORD=alice

# Perform authentication and extract the session cookie
COOKIE=$(curl "${AUTH_ENDPOINT}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${EMAIL}\", \"password\": \"${PASSWORD}\"}" \
  -i  | grep -i 'Set-Cookie' | awk -F': ' '{gsub(/;.*/, "", $2); print $2}' )

# should copy the full cooke `css-account=123` not just 123 to the .env

echo "received: $COOKIE"


if [ -z "$COOKIE" ]; then
  echo "Authentication failed. Check your credentials and authentication endpoint."
fi

export FEDCM_IDP_AUTH_COOKIE="${COOKIE}"
export FEDCM_IDP_HOST="${IDP_HOST}"

echo "IDP_HOST: ${IDP_HOST}"
echo "AUTH_ENDPOINT: ${AUTH_ENDPOINT}"
echo "Cookie: ${COOKIE}"
echo "Authentication successful. Cookie: ${FEDCM_IDP_AUTH_COOKIE}"
echo "API URL: ${FEDCM_IDP_HOST}"

