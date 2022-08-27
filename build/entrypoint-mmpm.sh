#!/bin/bash

echo "copy config files to host ..."

[[ -f /home/node/.config/mmpm/mmpm-env.json ]] || export FIX_MM_URI=1

mkdir -p /home/node/.config/mmpm/
sudo cp -rvn /home/node/mmpm/* /home/node/.config/mmpm/
sudo chown -R node:node /home/node/.config/mmpm/

echo "install mmpm as module ..."
yes | mmpm install --as-module

# the above command sets MMPM_IS_DOCKER_IMAGE to false, so fix this now:
sed -i -r 's|"MMPM_IS_DOCKER_IMAGE": (.*)|"MMPM_IS_DOCKER_IMAGE": true|g' /home/node/.config/mmpm/mmpm-env.json

# sets default value if file didn't exist before
[[ $FIX_MM_URI == 1 ]] && sed -i -r "s|\"MMPM_MAGICMIRROR_URI\": (.*)|\"MMPM_MAGICMIRROR_URI\": \"http://$LOCAL_IP:8080\",|g" /home/node/.config/mmpm/mmpm-env.json

echo "check if config.js contains mmpm module section ..."
[[ "$(cat /home/node/MagicMirror/config/config.js | grep 'module: "mmpm"')" ]] || sed -i 's|modules: \[|modules: \[{ module: "mmpm" },|g' /home/node/MagicMirror/config/config.js

echo "starting nginx ..."
sudo /usr/sbin/nginx -g 'daemon on; master_process on;' &

echo "starting wssh ..."
/home/node/.local/bin/wssh --address=127.0.0.1 --port=7893 &

echo "starting gunicorn ..."
/home/node/.local/bin/gunicorn --reload --worker-class eventlet --bind localhost:7891 mmpm.wsgi:app --user=node
