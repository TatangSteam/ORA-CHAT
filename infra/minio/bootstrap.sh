#!/bin/sh
set -eu

secret() {
  value="$(cat "/run/secrets/$1")"
  if [ -z "$value" ]; then
    echo "Required MinIO bootstrap secret is empty." >&2
    exit 1
  fi
  printf '%s' "$value"
}

root_user="$(secret minio_root_user)"
root_password="$(secret minio_root_password)"
api_access="$(secret minio_api_access_key)"
api_parent_secret="$(secret minio_api_parent_secret)"
api_secret="$(secret minio_api_secret_key)"
operator_access="$(secret minio_operator_access_key)"
operator_secret="$(secret minio_operator_secret_key)"
worker_access="$(secret minio_worker_access_key)"
worker_parent_secret="$(secret minio_worker_parent_secret)"
worker_secret="$(secret minio_worker_secret_key)"

mc alias set local http://minio:9000 "$root_user" "$root_password" >/dev/null
mc ready local >/dev/null

for bucket in raho-quarantine raho-knowledge raho-exports; do
  mc mb --ignore-existing "local/$bucket" >/dev/null
  mc anonymous set none "local/$bucket" >/dev/null
done

mc version enable local/raho-knowledge >/dev/null
mc ilm import local/raho-quarantine </bootstrap/lifecycle/quarantine.json >/dev/null
mc ilm import local/raho-knowledge </bootstrap/lifecycle/knowledge.json >/dev/null
mc ilm import local/raho-exports </bootstrap/lifecycle/exports.json >/dev/null

mc admin policy create local raho-api /bootstrap/policies/api.json >/dev/null
mc admin policy create local raho-worker /bootstrap/policies/worker.json >/dev/null

mc admin user add local raho-api-parent "$api_parent_secret" >/dev/null
mc admin user add local raho-worker-parent "$worker_parent_secret" >/dev/null
mc admin user add local "$operator_access" "$operator_secret" >/dev/null
mc admin policy attach local raho-api --user raho-api-parent >/dev/null
mc admin policy attach local raho-worker --user raho-worker-parent >/dev/null

if mc admin user svcacct info local "$api_access" >/dev/null 2>&1; then
  mc admin user svcacct edit local "$api_access" --secret-key "$api_secret" --policy /bootstrap/policies/api.json >/dev/null
else
  mc admin user svcacct add local raho-api-parent --access-key "$api_access" --secret-key "$api_secret" --policy /bootstrap/policies/api.json --name raho-api >/dev/null
fi

if mc admin user svcacct info local "$worker_access" >/dev/null 2>&1; then
  mc admin user svcacct edit local "$worker_access" --secret-key "$worker_secret" --policy /bootstrap/policies/worker.json >/dev/null
else
  mc admin user svcacct add local raho-worker-parent --access-key "$worker_access" --secret-key "$worker_secret" --policy /bootstrap/policies/worker.json --name raho-worker >/dev/null
fi

mc admin group add local raho-operators "$operator_access" >/dev/null
mc admin policy attach local consoleAdmin --group raho-operators >/dev/null

unset root_user root_password api_access api_parent_secret api_secret operator_access operator_secret
unset worker_access worker_parent_secret worker_secret value

mc admin info local >/dev/null
printf '{"status":"passed","buckets":3,"policies":2,"serviceAccounts":2}\n'
