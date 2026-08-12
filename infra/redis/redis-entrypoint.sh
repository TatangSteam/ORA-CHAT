#!/bin/sh
set -eu

password="$(cat /run/secrets/redis_password)"

if [ "${#password}" -lt 48 ]; then
  echo "Redis password must contain at least 48 characters." >&2
  exit 1
fi

case "$password" in
  *[!A-Za-z0-9]*)
    echo "Redis password must be alphanumeric." >&2
    exit 1
    ;;
esac

umask 077
cp /etc/redis/raho-redis.conf /run/raho-redis.conf
printf '\nrequirepass %s\n' "$password" >>/run/raho-redis.conf
chown redis:redis /run/raho-redis.conf
unset password

exec /usr/local/bin/docker-entrypoint.sh redis-server /run/raho-redis.conf
