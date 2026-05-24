#!/usr/bin/env bash
set -euo pipefail

ANDROID_STUDIO_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
ANDROID_SDK_DIR="${HOME}/Library/Android/sdk"

if [[ ! -d "${ANDROID_STUDIO_JBR}" ]]; then
  echo "Android Studio JBR not found at: ${ANDROID_STUDIO_JBR}" >&2
  return 1 2>/dev/null || exit 1
fi

if [[ ! -d "${ANDROID_SDK_DIR}" ]]; then
  echo "Android SDK not found at: ${ANDROID_SDK_DIR}" >&2
  return 1 2>/dev/null || exit 1
fi

export JAVA_HOME="${ANDROID_STUDIO_JBR}"
export ANDROID_HOME="${ANDROID_SDK_DIR}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_DIR}"
export PATH="${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/emulator:${PATH}"

echo "JAVA_HOME=${JAVA_HOME}"
echo "ANDROID_HOME=${ANDROID_HOME}"
echo "ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT}"
