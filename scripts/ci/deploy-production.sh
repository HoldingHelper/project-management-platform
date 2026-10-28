#!/usr/bin/env bash
set -Eeuo pipefail

: "${GCP_ID_TOKEN:?missing GitLab OIDC token}"
: "${CI_COMMIT_SHA:?missing commit SHA}"
: "${CI_PIPELINE_ID:?missing pipeline ID}"
: "${CI_JOB_ID:?missing job ID}"
[[ "$CI_COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
[[ "$CI_PIPELINE_ID" =~ ^[0-9]+$ && "$CI_JOB_ID" =~ ^[0-9]+$ ]] || exit 1

project=ava-persian
region=europe-west1
repo=europe-west1-docker.pkg.dev/ava-persian/ava-persian-api
api_image="$repo/pmp-api:$CI_COMMIT_SHA"
web_image="$repo/pmp-frontend:$CI_COMMIT_SHA"
provider=projects/706796253833/locations/global/workloadIdentityPools/pmp-gitlab/providers/gitlab
auth_dir=$(mktemp -d)
umask 077
printf '%s' "$GCP_ID_TOKEN" > "$auth_dir/token"
trap 'rm -f "$auth_dir/token" "$auth_dir/credential.json"; rmdir "$auth_dir"' EXIT
gcloud iam workload-identity-pools create-cred-config "$provider" --service-account=pmp-gitlab-deployer@ava-persian.iam.gserviceaccount.com --credential-source-file="$auth_dir/token" --output-file="$auth_dir/credential.json" --quiet
gcloud auth login --cred-file="$auth_dir/credential.json" --quiet
gcloud config set project "$project" --quiet

active_revision() {
  gcloud run services describe "$1" --region="$region" --format=json | python3 -c 'import json,sys; t=[x for x in json.load(sys.stdin)["status"]["traffic"] if x.get("percent",0)>0]; assert len(t)==1 and t[0]["percent"]==100, "Release requires one 100% traffic revision"; print(t[0]["revisionName"])'
}
previous_api=$(active_revision pmp-api)
previous_web=$(active_revision pmp-frontend)
echo "Rollback revisions: API=$previous_api frontend=$previous_web"

gcloud builds submit backend --region="$region" --config=scripts/ci/cloudbuild-test.yaml --suppress-logs --quiet
gcloud builds submit backend --region="$region" --config=scripts/ci/cloudbuild-api.yaml --substitutions="_IMAGE=$api_image" --suppress-logs --quiet
gcloud builds submit frontend --region="$region" --config=scripts/ci/cloudbuild-web.yaml --substitutions="_IMAGE=$web_image" --suppress-logs --quiet
api_digest=$(gcloud artifacts docker images describe "$api_image" --format='value(image_summary.digest)')
web_digest=$(gcloud artifacts docker images describe "$web_image" --format='value(image_summary.digest)')
[[ "$api_digest" == sha256:* && "$web_digest" == sha256:* ]]

backup_description="pmp-gitlab-$CI_PIPELINE_ID"
gcloud sql backups create --instance=pmp-postgres --description="$backup_description" --quiet
gcloud sql backups list --instance=pmp-postgres --format=json | python3 -c 'import json,sys; d=sys.argv[1]; b=[x for x in json.load(sys.stdin) if x.get("description")==d and x.get("status")=="SUCCESSFUL"]; assert b, "Successful backup not found"; print("Verified backup", b[0]["id"])' "$backup_description"

gcloud run deploy pmp-api --region="$region" --image="$repo/pmp-api@$api_digest" --no-traffic --tag=pmp-candidate --quiet
candidate_api=$(gcloud run services describe pmp-api --region="$region" --format='value(status.latestReadyRevisionName)')
api_url=$(gcloud run services describe pmp-api --region="$region" --format=json | python3 -c 'import json,sys; print(next(x["url"] for x in json.load(sys.stdin)["status"]["traffic"] if x.get("tag")=="pmp-candidate"))')
curl --fail --silent --show-error --retry 6 --retry-all-errors --retry-delay 5 --max-time 30 "$api_url/health" > /dev/null

gcloud run deploy pmp-frontend --region="$region" --image="$repo/pmp-frontend@$web_digest" --no-traffic --tag=pmp-candidate --quiet
candidate_web=$(gcloud run services describe pmp-frontend --region="$region" --format='value(status.latestReadyRevisionName)')
web_url=$(gcloud run services describe pmp-frontend --region="$region" --format=json | python3 -c 'import json,sys; print(next(x["url"] for x in json.load(sys.stdin)["status"]["traffic"] if x.get("tag")=="pmp-candidate"))')
curl --fail --silent --show-error --retry 6 --retry-all-errors --retry-delay 5 --max-time 30 "$web_url/login" > /dev/null

rollback() {
  echo 'Release failed; restoring previous traffic revisions.' >&2
  gcloud run services update-traffic pmp-api --region="$region" --to-revisions="$previous_api=100" --quiet || true
  gcloud run services update-traffic pmp-frontend --region="$region" --to-revisions="$previous_web=100" --quiet || true
  echo 'Database migrations are not rolled back automatically; use the verified backup and investigate.' >&2
}
trap 'rollback; exit 1' ERR
gcloud run services update-traffic pmp-api --region="$region" --to-revisions="$candidate_api=100" --quiet
gcloud run services update-traffic pmp-frontend --region="$region" --to-revisions="$candidate_web=100" --quiet
curl --fail --silent --show-error --retry 6 --retry-all-errors --retry-delay 5 --max-time 30 https://pmp-api-xsnbdxq3la-ew.a.run.app/health > /dev/null
curl --fail --silent --show-error --retry 6 --retry-all-errors --retry-delay 5 --max-time 30 https://pmp.avenourgroup.com/login > /dev/null
status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 30 https://pmp.avenourgroup.com/api/v1/docs/spaces)
[[ "$status" == 401 ]] || { echo "API proxy authentication guard returned $status" >&2; false; }
trap - ERR
echo "Deployed commit $CI_COMMIT_SHA: API=$candidate_api frontend=$candidate_web"
