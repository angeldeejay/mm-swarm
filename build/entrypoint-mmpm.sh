#!/bin/bash
set -e
pushd . >/dev/null
SCRIPT_PATH="${BASH_SOURCE[0]}"
while ([ -h "${SCRIPT_PATH}" ]); do
  cd "$(dirname "${SCRIPT_PATH}")"
  SCRIPT_PATH="$(readlink "$(basename "${SCRIPT_PATH}")")"
done
cd "$(dirname "${SCRIPT_PATH}")" >/dev/null
SCRIPT_PATH="$(pwd)"
popd >/dev/null

echo "copy config files to host ..."

node /home/node/externalUpdater.js
mkdir -p /home/node/.config/mmpm/
sudo cp -rvn /home/node/mmpm/* /home/node/.config/mmpm/
sudo chown -R node:node /home/node/.config/mmpm/

echo "install mmpm as module ..."
yes | mmpm install --as-module >/dev/null 2>&1

# the above command sets MMPM_IS_DOCKER_IMAGE to false, so fix this now:
sed -i -r 's|"MMPM_IS_DOCKER_IMAGE": (.*)|"MMPM_IS_DOCKER_IMAGE": true|g' /home/node/.config/mmpm/mmpm-env.json

# sets default value
sed -i -r "s@\"MMPM_MAGICMIRROR_URI\":(.*)@\"MMPM_MAGICMIRROR_URI\": \"http://${LOCAL_IP}:${MM_PORT}\",@g" /home/node/.config/mmpm/mmpm-env.json

replace_port() {
  PORT_A="$1"
  REPLACE_PATH="$2"
  PORT_B=
  case "$1" in
  8080) PORT_B="$MM_PORT" ;;
  7890) PORT_B="$MMPM_PORT" ;;
  7892) PORT_B="$MMPM_WSSH_PORT" ;;
  *) ;;
  esac

  if [[ "$PORT_B" != "" && "$PORT_B" != "$PORT_A" ]]; then
    for FILE in $(sudo egrep -Rl "$PORT_A" "$REPLACE_PATH" | egrep -v 'assets'); do
      echo "patching port in $FILE: $PORT_A → $PORT_B"
      sudo sed -i -r "s/${PORT_A}/${PORT_B}/ig" "$FILE"
    done
  fi
}

for P in $(echo "/etc/nginx/sites-available/ /home/node/.config/mmpm/ /var/www/mmpm/static/"); do
  for A in $(echo "8080 7890 7892"); do
    replace_port "$A" "$P"
  done
done

for F in $(sudo egrep -Rl '(localhost|127.0.0.1)' /var/www/mmpm/static/ | egrep -v 'assets'); do
  sudo sed -i -r "s/(localhost|127\.0\.0\.1)/$LOCAL_IP/ig" "$F"
done

echo "check if config.js contains mmpm module section ..."
[[ "$(cat /home/node/MagicMirror/config/config.js | grep 'module: "mmpm"')" ]] || sed -i 's|modules: \[|modules: \[{ module: "mmpm" },|g' /home/node/MagicMirror/config/config.js

echo "starting nginx ..."
sudo /usr/sbin/nginx -g 'daemon on; master_process on;' &

echo "starting wssh ..."
/home/node/.local/bin/wssh --address=127.0.0.1 --port=7893 &

echo "starting gunicorn ..."
/home/node/.local/bin/gunicorn --reload --worker-class eventlet --bind localhost:7891 mmpm.wsgi:app --user=node
