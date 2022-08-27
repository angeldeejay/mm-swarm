#!/usr/bin/env bash
pushd . >/dev/null
SCRIPT_PATH="${BASH_SOURCE[0]}"
while ([ -h "${SCRIPT_PATH}" ]); do
  cd "$(dirname "${SCRIPT_PATH}")"
  SCRIPT_PATH="$(readlink "$(basename "${SCRIPT_PATH}")")"
done
cd "$(dirname "${SCRIPT_PATH}")" >/dev/null
SCRIPT_PATH="$(pwd)"
popd >/dev/null

for module in $(ls -1 $SCRIPT_PATH/modules | egrep -v '(default|mmpm)'); do
  if [[ -f "${SCRIPT_PATH}/modules/${module}/package.json" ]]; then
    if [[ ! -d "${SCRIPT_PATH}/modules/${module}/node_modules" ]]; then
      touch "${SCRIPT_PATH}/modules/${module}/.installing"
      echo "Installing ${module}"
      npm install --prefix "${SCRIPT_PATH}/modules/${module}/"
      rm -fr "${SCRIPT_PATH}/modules/${module}/.installing"
    fi
  fi
done

(echo "Preparing instance..." &&
  npm install --prefix "${SCRIPT_PATH}/" >/dev/null 2>&1) &&
  npm run server --prefix "${SCRIPT_PATH}/" ||
  (echo "Something went wrong!" && exit 1)
