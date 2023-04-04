#!/usr/bin/env bash
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

MM_USER=$(whoami)

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

for P in $(echo "/etc/nginx/sites-available/ /home/pn/.config/mmpm/ /var/www/mmpm/static/"); do
  for A in $(echo "8080 7890 7892"); do
    replace_port "$A" "$P"
  done
done

for F in $(sudo egrep -Rl '(localhost|127.0.0.1)' /var/www/mmpm/static/ | egrep -v 'assets'); do
  sudo sed -i -r "s/(localhost|127\.0\.0\.1)/$LOCAL_IP/ig" "$F"
done

echo "starting nginx ..."
sudo /usr/sbin/nginx -g 'daemon on; master_process on;' &

echo "starting gunicorn ..."
/home/pn/.local/bin/gunicorn --reload --worker-class gevent --bind localhost:7891 mmpm.wsgi:app --user=pn >/var/log/gunicorn.log 2>&1 &

sudo tail -q -n 0 -f /var/log/gunicorn.log /var/log/nginx/*.log
