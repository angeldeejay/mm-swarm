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

TOKEN="ZGQ3ZWJkNjYzYjJjOTZhYzZmZGM6ZTk2MTZkNzkzZTI5M2ZjZDQ2ZTUwNzE3NmE3ZmJlZjA1N2I3MGM2Mg=="
MM_HOME="${SCRIPT_PATH}/MagicMirror"
MM_MODULES="${MM_HOME}/modules"

log_this() {
  echo "$(printf '[%(%m.%d.%Y %H:%M:%S.000)T] [UPDATER] ' -1)$1"
}

while true; do
  cd $SCRIPT_PATH
  for MODULE_PATH in $(find $MM_MODULES -maxdepth 1 -mindepth 1 -type d); do
    MODULE="${MODULE_PATH##*/}"
    cd $MODULE_PATH
    if [[ "$MODULE" != "default" && -d "$MODULE_PATH/.git" ]]; then
      if [[ $(git fetch --dry-run 2>&1 | wc -l) -ne 0 ]]; then
        log_this "Updating $MODULE"
        (
          (git checkout . >/dev/null 2>&1 || true) &&
            git pull >/dev/null 2>&1 &&
            (npm install --omit=dev --no-audit --no-fund --prefix "$MODULE_PATH" >/dev/null 2>&1 || true) &&
            log_this "$MODULE updated"
        ) || log_this "$MODULE update failed"
      fi
    else
      log_this "Skipping $MODULE"
    fi
  done

  log_this "Checking MagicMirror"
  cd $MM_HOME
  CURRENT_VERSION=$(cat "${MM_HOME}/package.json" | grep '"version":' | cut -d '"' -f 4)
  LATEST_VERSION=$(curl -s -H "Authorization: Basic $TOKEN" "https://api.github.com/repos/MichMich/MagicMirror/releases/latest" | grep '"tag_name":' | cut -d '"' -f 4 | cut -d 'v' -f 2)

  if [[ "$LATEST_VERSION" != "" && "$LATEST_VERSION" != "$CURRENT_VERSION" ]]; then
    log_this "Updating MagicMirror: $CURRENT_VERSION → $LATEST_VERSION"
    (
      git checkout . >/dev/null 2>&1 &&
        git checkout $LATEST_VERSION >/dev/null 2>&1 &&
        npm run install-mm --prefix "${MM_HOME}" &&
        log_this "MagicMirror updated: $LATEST_VERSION"
    ) || log_this "Update MagicMirror failed"
    touch $SCRIPT_PATH/update
  else
    log_this "MagicMirror is up to date: $CURRENT_VERSION"
  fi

  sleep 600
done
