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

MM_HOME="${SCRIPT_PATH}/MagicMirror"
MM_MODULES="${MM_HOME}/modules"

while true; do
  cd $SCRIPT_PATH

  for MODULE in $(find $MM_MODULES -maxdepth 1 -mindepth 1 -type d -printf '%f\n'); do
    if [["$MODULE" != "MMM-mmpm" && "$MODULE" != "default"]]; then
      MODULE_PATH="${MM_MODULES}/${MODULE}"
      cd $MODULE_PATH
      fetch_stdout=$(git fetch --dry-run)
      if [ "$fetch_stdout" != "" ]; then
        echo "Updating $MODULE"
        (
          (git checkout . >/dev/null 2>&1 || true) &&
            git pull &&
            npm install --omit=dev --no-audit --no-fund --prefix "${MODULE_PATH}"
        ) ||
          echo "Update $MODULE failed"
      else
        echo "$MODULE is up to date"
      fi
    fi
  done

  cd $MM_HOME
  CURRENT_VERSION=$(git describe --tags --exact-match 2>/dev/null || git symbolic-ref -q --short HEAD || git rev-parse --short HEAD)
  LATEST_VERSION=$(curl -s "https://api.github.com/repos/MichMich/MagicMirror/releases/latest" | grep '"tag_name":' | cut -d '"' -f 4)

  if [[ "$LATEST_VERSION" != "$CURRENT_VERSION" ]]; then
    echo "Updating MagicMirror: $CURRENT_VERSION → $LATEST_VERSION"
    (
      pm2 stop $SCRIPT_PATH/ecosystem.config.js &&
        git checkout $LATEST_VERSION &&
        npm run install-mm --prefix "${MM_HOME}"
    ) || echo "Update MagicMirror failed"
    pm2 restart $SCRIPT_PATH/ecosystem.config.js
  else
    echo "MagicMirror is up to date"
  fi
  sleep 60
done
