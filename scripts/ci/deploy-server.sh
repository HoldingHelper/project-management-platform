#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$CI_SERVER_URL" = https://gitlab.avenourgroup.com && "$CI_COMMIT_REF_PROTECTED" = true ]]
[[ "$CI_COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]
case "$1" in
 demo) host=191.101.113.95; key="$PMP_DEMO_SSH_KEY" ;;
 prod) host=185.126.203.60; key="$PMP_PROD_SSH_KEY" ;;
 *) exit 1 ;;
esac
[[ "$CI_COMMIT_BRANCH" = main ]]
export CLOUDSDK_CONFIG="$(mktemp -d)"
trap 'rm -rf "$CLOUDSDK_CONFIG"' EXIT
printf '%s' "$GCP_ID_TOKEN" > "$CLOUDSDK_CONFIG/id-token"
gcloud iam workload-identity-pools create-cred-config projects/706796253833/locations/global/workloadIdentityPools/pmp-gitlab/providers/gitlab --service-account=pmp-gitlab-deployer@ava-persian.iam.gserviceaccount.com --credential-source-file="$CLOUDSDK_CONFIG/id-token" --output-file="$CLOUDSDK_CONFIG/federation.json" --quiet
gcloud auth login --cred-file="$CLOUDSDK_CONFIG/federation.json" --quiet
archive="gs://pmp-server-releases-ava-persian/$CI_COMMIT_SHA/pmp-images.tar.gz"
if ! gcloud storage ls "$archive" >/dev/null 2>&1; then
 gcloud builds submit --project ava-persian --region europe-west1 --config scripts/ci/cloudbuild-server.yaml --substitutions="_SHA=$CI_COMMIT_SHA" --suppress-logs --quiet .
fi
gcloud storage cp "$archive" "$CLOUDSDK_CONFIG/images.tar.gz" --quiet
command -v ssh >/dev/null || { apt-get update -qq && apt-get install -y -qq openssh-client; }
chmod 600 "$key"
export PMP_ARCHIVE="$CLOUDSDK_CONFIG/images.tar.gz"
python3 - <<'PAYLOAD' | ssh -T -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$PMP_SERVER_KNOWN_HOSTS" -i "$key" pmp-deploy@"$host"
import hashlib,json,os,sys
p=os.environ['PMP_ARCHIVE'];sha=os.environ['CI_COMMIT_SHA'];h=hashlib.sha256()
with open(p,'rb') as f:
 while chunk:=f.read(1024*1024):h.update(chunk)
images={k:'europe-west1-docker.pkg.dev/ava-persian/ava-persian-api/'+v+':server-'+sha for k,v in [('api','pmp-api'),('web','pmp-frontend')]}
sys.stdout.buffer.write((json.dumps({'sha':sha,'archive_sha256':h.hexdigest(),'images':images})+'\n').encode());sys.stdout.buffer.flush()
with open(p,'rb') as f:
 while chunk:=f.read(1024*1024):sys.stdout.buffer.write(chunk)
PAYLOAD
