#!/bin/sh
# Install CleanFrame on an LG TV in Developer Mode, from an iPhone or iPad (iSH), an Android
# phone (Termux), macOS or Linux. Needs a POSIX shell, OpenSSH, tar and gzip; iSH gets OpenSSH here.
#
#   sh install-tv.sh              download CleanFrame from GitHub, package it here and install it
#   sh install-tv.sh FILE.ipk     install this package instead
#   sh install-tv.sh --remove     uninstall CleanFrame
#
# The flow follows Free My TV's webos/install.py (MIT): the TV's key from its Key Server, unlocked
# with the passphrase the TV shows, then the package over SSH (port 9922, user prisoner) to the
# TV's own installer, com.webos.appInstallService. The packaging matches LG's ares-package output.
set -eu

APP=io.cleanframe.lg
SOURCE=${CLEANFRAME_SOURCE:-https://codeload.github.com/w8997wnwy5-collab/modificatv/tar.gz/HEAD}
TEMP=/media/developer/temp/cleanframe.ipk
SSH_PORT=${CLEANFRAME_SSH_PORT:-9922} KEY_PORT=${CLEANFRAME_KEY_PORT:-9991}
WORK=${TMPDIR:-/tmp}/cleanframe.$$
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT TERM

say() { printf '%s\n' "$*"; }
fail() { printf '\n%s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1; }
fetch() { if need curl; then curl -fsSL "$1"; else wget -qO- "$1"; fi; }
ask() { printf '%s' "$1" >&2; read -r REPLY || REPLY=''; }

# The App Store build of iSH ships without apk; this restores it as the iSH wiki describes.
bootstrap_apk() {
  release=$(cut -d. -f1,2 /etc/alpine-release)
  base=http://dl-cdn.alpinelinux.org/alpine/v$release/main/x86
  name=$(wget -qO- "$base/" 2>/dev/null | grep -o 'apk-tools-static-[^"]*\.apk' | head -n 1 || true)
  # The file the wiki names for the App Store build's Alpine 3.14.
  if [ -z "$name" ] && [ "$release" = 3.14 ]; then name=apk-tools-static-2.12.7-r0.apk; fi
  [ -n "$name" ] || fail "Non trovo apk-tools per questa versione di iSH."
  (cd "$WORK" && wget -qO- "$base/$name" | tar -xz sbin/apk.static && ./sbin/apk.static add -q apk-tools) \
    || fail "Non riesco a installare apk in iSH. Controlla la connessione e riprova."
}
tools() {
  if need ssh && need ssh-keygen && { need curl || need wget; }; then return; fi
  if [ -f /etc/alpine-release ]; then
    say "Installo gli strumenti SSH (solo la prima volta)..."
    need apk || bootstrap_apk
    apk add -q openssh-client openssh-keygen curl || apk add -q openssh curl || fail "Installazione di OpenSSH non riuscita."
  elif need pkg; then
    pkg install -y openssh || fail "Installazione di OpenSSH non riuscita."
  else
    fail "Servono ssh e ssh-keygen (OpenSSH)."
  fi
}

# The package: an ar archive of debian-binary, control.tar.gz and data.tar.gz, as LG's tools make it.
ar_member() {
  size=$(wc -c < "$WORK/$1" | tr -d ' ')
  printf '%-16s%-12s%-6s%-6s%-8s%-10s`\n' "$1" "$(date +%s)" 0 0 100644 "$size"
  cat "$WORK/$1"
  if [ $((size % 2)) -eq 1 ]; then printf '\n'; fi
}
build() {
  say "Scarico CleanFrame da GitHub..."
  mkdir -p "$WORK/src" "$WORK/root/usr/palm/applications" "$WORK/root/usr/palm/services" "$WORK/root/usr/palm/packages/$APP"
  fetch "$SOURCE" | tar -xzf - -C "$WORK/src" || fail "Download non riuscito. Controlla la connessione a internet."
  src=$(find "$WORK/src" -mindepth 1 -maxdepth 1 -type d | head -n 1)
  [ -f "$src/app/appinfo.json" ] && [ -f "$src/service/services.json" ] || fail "Il download non contiene CleanFrame."
  version=$(sed -n 's/^ *"version": *"\([0-9.]*\)".*/\1/p' "$src/app/appinfo.json" | head -n 1)
  say "Preparo il pacchetto (versione $version)..."
  cp -R "$src/app" "$WORK/root/usr/palm/applications/$APP"
  cp -R "$src/service" "$WORK/root/usr/palm/services/$APP.service"
  printf '{\n  "id": "%s",\n  "version": "%s",\n  "app": "%s",\n  "services": [\n    "%s.service"\n  ]\n}\n' \
    "$APP" "$version" "$APP" "$APP" > "$WORK/root/usr/palm/packages/$APP/packageinfo.json"
  bytes=$(find "$WORK/root" -type f -exec cat {} \; | wc -c | tr -d ' ')
  printf 'Package: %s\nVersion: %s\nSection: misc\nPriority: optional\nArchitecture: all\nInstalled-Size: %s\nMaintainer: CleanFrame\nDescription: CleanFrame for LG webOS\nwebOS-Package-Format-Version: 2\nwebOS-Packager-Version: x.y.x\n' \
    "$APP" "$version" "$bytes" > "$WORK/control"
  (cd "$WORK" && tar -czf control.tar.gz control) && (cd "$WORK/root" && tar -czf ../data.tar.gz usr) \
    || fail "Non riesco a preparare il pacchetto."
  printf '2.0\n' > "$WORK/debian-binary"
  { printf '!<arch>\n'; ar_member debian-binary; ar_member control.tar.gz; ar_member data.tar.gz; } > "$WORK/cleanframe.ipk"
  IPK=$WORK/cleanframe.ipk
}

tv() {
  ssh -i "$KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedKeyTypes=+ssh-rsa -o ConnectTimeout=15 "$@"
}
# luna-send-pub prints nothing without a terminal; firmware that refuses one streams with -i instead.
# Older webOS ships a BusyBox timeout that only takes -t SECONDS.
luna() {
  wait="if timeout -t 1 true 2>/dev/null; then T='timeout -t $4'; else T='timeout $4'; fi; "
  out=$(tv -tt "prisoner@$IP" "$wait\$T luna-send-pub -n $3 $1 '$2'" < /dev/null 2>/dev/null || true)
  if [ -z "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
    out=$(tv "prisoner@$IP" "$wait\$T luna-send-pub -i $1 '$2' < /dev/null" < /dev/null 2>/dev/null || true)
  fi
  printf '%s' "$out"
}

key() {
  KEY=$HOME/.ssh/cleanframe_tv_$(printf '%s' "$IP" | tr . _)
  [ -f "$KEY" ] && return
  say "Prendo la chiave della TV dal Key Server..."
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  fetch "http://$IP:$KEY_PORT/webos_rsa" > "$KEY.new" 2>/dev/null || {
    rm -f "$KEY.new"
    fail "Non trovo la TV su $IP. Sulla TV, in Developer Mode, attiva Key Server; il telefono deve essere sullo stesso Wi-Fi. Su iPhone/iPad: Impostazioni > Privacy e sicurezza > Rete locale > attiva iSH."
  }
  chmod 600 "$KEY.new"
  stty -echo 2>/dev/null || true
  ask "Passphrase mostrata in Developer Mode: "
  stty echo 2>/dev/null || true
  printf '\n' >&2
  ssh-keygen -q -p -P "$REPLY" -N '' -f "$KEY.new" > /dev/null 2>&1 \
    || { rm -f "$KEY.new"; fail "Passphrase sbagliata: ricontrollala (maiuscole e minuscole contano) e riprova."; }
  mv "$KEY.new" "$KEY"
}

mkdir -p "$WORK"
tools
IP=${CLEANFRAME_TV_IP:-}
if [ -z "$IP" ]; then
  last=$(cat "$HOME/.cleanframe-tv" 2>/dev/null || true)
  ask "Indirizzo IP della TV (lo vedi in Developer Mode)${last:+ [$last]}: "
  IP=${REPLY:-$last}
fi
printf '%s' "$IP" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || fail "Indirizzo IP non valido: $IP"
printf '%s\n' "$IP" > "$HOME/.cleanframe-tv"
key

if [ "${1:-}" = "--remove" ]; then
  case $(luna luna://com.webos.appInstallService/dev/remove "{\"id\":\"$APP\"}" 3 30) in
    *'"returnValue":true'*|*'"returnValue": true'*) say "CleanFrame è stata rimossa dalla TV." ;;
    *) fail "La TV non ha confermato la rimozione." ;;
  esac
  exit 0
fi
if [ -n "${1:-}" ]; then
  [ -f "$1" ] || fail "File non trovato: $1"
  IPK=$1
else
  build
fi
say "Copio CleanFrame sulla TV..."
tv "prisoner@$IP" "mkdir -p /media/developer/temp && cat > $TEMP" < "$IPK" || {
  rm -f "$KEY"
  fail "Copia non riuscita. Controlla che Developer Mode sia attiva e riprova: ti chiederò di nuovo la passphrase."
}
say "Installo..."
out=$(luna luna://com.webos.appInstallService/dev/install "{\"id\":\"$APP\",\"ipkUrl\":\"$TEMP\",\"subscribe\":true}" 30 120)
tv "prisoner@$IP" "rm -f $TEMP" < /dev/null > /dev/null 2>&1 || true
case $out in
  *'"state":"installed"'*|*'"state": "installed"'*) ;;
  *) fail "La TV non ha completato l'installazione. Risposta: $out" ;;
esac
luna luna://com.webos.applicationManager/launch "{\"id\":\"$APP\"}" 1 20 > /dev/null
say "Fatto: CleanFrame è installata e aperta sulla TV."
say "Ricorda: ogni tanto apri Developer Mode sulla TV e premi EXTEND."
