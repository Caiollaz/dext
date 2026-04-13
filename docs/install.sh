#!/bin/sh
# DEXT — Linux Installer
# Usage: curl -fsSL https://caiollaz.github.io/dext/install.sh | sh

set -e

VERSION="2.3.0"
REPO="Caiollaz/dext"
BASE_URL="https://github.com/${REPO}/releases/download/v${VERSION}"
INSTALL_DIR="${HOME}/.local/bin"

echo ""
echo "  DEXT Installer — v${VERSION}"
echo "  =============================="
echo ""

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  *)
    echo "  Error: Unsupported architecture: ${ARCH}"
    echo "  DEXT currently supports x86_64 (amd64) only."
    exit 1
    ;;
esac

# Detect package manager and install method
install_deb() {
  FILENAME="Dext_${VERSION}_${ARCH}.deb"
  URL="${BASE_URL}/${FILENAME}"
  TMPFILE=$(mktemp /tmp/dext-XXXXXX.deb)
  echo "  Downloading ${FILENAME}..."
  curl -fSL "$URL" -o "$TMPFILE"
  echo "  Installing via dpkg..."
  sudo dpkg -i "$TMPFILE" || sudo apt-get install -f -y
  rm -f "$TMPFILE"
  echo ""
  echo "  DEXT installed successfully!"
  echo "  Run 'dext' or find it in your application menu."
}

install_rpm() {
  FILENAME="Dext-${VERSION}-1.x86_64.rpm"
  URL="${BASE_URL}/${FILENAME}"
  TMPFILE=$(mktemp /tmp/dext-XXXXXX.rpm)
  echo "  Downloading ${FILENAME}..."
  curl -fSL "$URL" -o "$TMPFILE"
  echo "  Installing via rpm..."
  sudo rpm -i "$TMPFILE" || true
  rm -f "$TMPFILE"
  echo ""
  echo "  DEXT installed successfully!"
  echo "  Run 'dext' or find it in your application menu."
}

install_appimage() {
  FILENAME="Dext_${VERSION}_${ARCH}.AppImage"
  URL="${BASE_URL}/${FILENAME}"
  mkdir -p "$INSTALL_DIR"
  DEST="${INSTALL_DIR}/dext"
  echo "  Downloading ${FILENAME}..."
  curl -fSL "$URL" -o "$DEST"
  chmod +x "$DEST"
  echo ""
  echo "  DEXT installed to ${DEST}"
  echo "  Make sure ${INSTALL_DIR} is in your PATH."
  echo "  Run 'dext' to start."
}

# Choose install method
if command -v dpkg >/dev/null 2>&1; then
  install_deb
elif command -v rpm >/dev/null 2>&1; then
  install_rpm
else
  echo "  No dpkg or rpm found. Installing AppImage..."
  install_appimage
fi

echo ""
