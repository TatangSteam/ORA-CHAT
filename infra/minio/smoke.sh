#!/bin/sh
set -eu

secret() {
  cat "/run/secrets/$1"
}

root_user="$(secret minio_root_user)"
root_password="$(secret minio_root_password)"
api_access="$(secret minio_api_access_key)"
api_secret="$(secret minio_api_secret_key)"
worker_access="$(secret minio_worker_access_key)"
worker_secret="$(secret minio_worker_secret_key)"

mc alias set root http://minio:9000 "$root_user" "$root_password" >/dev/null
mc alias set api http://minio:9000 "$api_access" "$api_secret" >/dev/null
mc alias set worker http://minio:9000 "$worker_access" "$worker_secret" >/dev/null
unset root_user root_password api_access api_secret worker_access worker_secret

mc admin info root >/dev/null
for bucket in raho-quarantine raho-knowledge raho-exports; do
  mc stat "root/$bucket" >/dev/null
done
case "$(mc version info root/raho-knowledge)" in
  *enabled*) ;;
  *) echo 'Knowledge versioning is not enabled.' >&2; exit 1 ;;
esac
case "$(mc ilm export root/raho-quarantine)" in
  *expire-quarantine-after-one-day*) ;;
  *) echo 'Quarantine lifecycle is missing.' >&2; exit 1 ;;
esac
case "$(mc ilm export root/raho-knowledge)" in
  *expire-noncurrent-after-thirty-days*) ;;
  *) echo 'Knowledge lifecycle is missing.' >&2; exit 1 ;;
esac
case "$(mc ilm export root/raho-exports)" in
  *expire-exports-after-one-day*) ;;
  *) echo 'Exports lifecycle is missing.' >&2; exit 1 ;;
esac

probe="tenants/00000000-0000-7000-8000-000000000000/documents/00000000-0000-7000-8000-000000000001/source/runtime-probe"
printf 'version-one' | mc pipe "worker/raho-knowledge/$probe" >/dev/null
printf 'version-two' | mc pipe "worker/raho-knowledge/$probe" >/dev/null
version_count=0
while IFS= read -r version_line; do
  if [ -n "$version_line" ]; then
    version_count=$((version_count + 1))
  fi
done <<EOF
$(mc ls --versions "root/raho-knowledge/$probe")
EOF
if [ "$version_count" -lt 2 ]; then
  echo 'MinIO object version smoke failed.' >&2
  exit 1
fi
mc stat "api/raho-knowledge/$probe" >/dev/null

quarantine_probe="tenants/00000000-0000-7000-8000-000000000000/documents/00000000-0000-7000-8000-000000000001/source/quarantine-probe"
printf 'quarantine' | mc pipe "api/raho-quarantine/$quarantine_probe" >/dev/null
if mc rm "api/raho-quarantine/$quarantine_probe" >/dev/null 2>&1; then
  echo 'API service account unexpectedly deleted a quarantine object.' >&2
  exit 1
fi
mc rm --force "worker/raho-quarantine/$quarantine_probe" >/dev/null

mc admin policy info root raho-api >/dev/null
mc admin policy info root raho-worker >/dev/null
mc admin group info root raho-operators >/dev/null
mc admin user svcacct info root "$(secret minio_api_access_key)" >/dev/null
mc admin user svcacct info root "$(secret minio_worker_access_key)" >/dev/null
mc quota set root/raho-exports --size 1GiB >/dev/null
case "$(mc quota info root/raho-exports)" in
  *'1.0 GiB'*) ;;
  *) echo 'Exports quota smoke failed.' >&2; exit 1 ;;
esac
mc event list root/raho-exports >/dev/null

mc rm --force --versions "root/raho-knowledge/$probe" >/dev/null
printf '{"status":"passed","bucketObject":true,"versioning":true,"lifecycle":true,"iam":true,"leastPrivilege":true,"quota":true,"events":true}\n'
