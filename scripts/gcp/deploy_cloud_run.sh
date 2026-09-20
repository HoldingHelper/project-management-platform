#!/bin/bash
set -euo pipefail

PROJECT_ID="ava-persian"
REGION="europe-west1"
GAR_REPO="ava-persian-api"
CLOUD_SQL_INSTANCE="ava-persian:europe-west1:pmp-postgres"
API_SERVICE_NAME="pmp-api"
FRONTEND_SERVICE_NAME="pmp-frontend"
STORAGE_BUCKET="pmp-storage-ava-persian"

echo "========================================================"
echo "🚀 Deploying Project Management Platform to Cloud Run"
echo "Project: $PROJECT_ID | Region: $REGION"
echo "========================================================"

# 1. Ensure secrets exist
if [ -f "scripts/gcp_secrets.env" ]; then
  set -a && source scripts/gcp_secrets.env && set +a
else
  echo "⚠️ scripts/gcp_secrets.env not found. Ensure Secret Manager secrets are configured."
fi

# 2. Wait for Cloud SQL instance to be RUNNABLE
echo "⏳ Checking Cloud SQL instance status ($CLOUD_SQL_INSTANCE)..."
while true; do
  STATUS=$(gcloud sql instances describe pmp-postgres --project="$PROJECT_ID" --format="value(state)" 2>/dev/null || echo "PENDING")
  echo "Current Cloud SQL state: $STATUS"
  if [ "$STATUS" = "RUNNABLE" ]; then
    echo "✅ Cloud SQL instance is RUNNABLE."
    break
  fi
  sleep 15
done

# 3. Create database and user if not exists
echo "📦 Ensuring database 'project_management' exists..."
gcloud sql databases create project_management --instance=pmp-postgres --project="$PROJECT_ID" 2>/dev/null || echo "Database already exists."

echo "👤 Ensuring user 'project_app' exists..."
DB_PASS=$(gcloud secrets versions access latest --secret=pmp-db-password --project="$PROJECT_ID")
gcloud sql users create project_app --instance=pmp-postgres --password="$DB_PASS" --project="$PROJECT_ID" 2>/dev/null || \
  gcloud sql users set-password project_app --instance=pmp-postgres --password="$DB_PASS" --project="$PROJECT_ID"

# 4. Configure pmp-database-url secret
DB_URL="postgresql+asyncpg://project_app:${DB_PASS}@/project_management?host=/cloudsql/${CLOUD_SQL_INSTANCE}"
if gcloud secrets describe pmp-database-url --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo -n "$DB_URL" | gcloud secrets versions add pmp-database-url --project="$PROJECT_ID" --data-file=-
else
  echo -n "$DB_URL" | gcloud secrets create pmp-database-url --project="$PROJECT_ID" --replication-policy=automatic --data-file=-
fi
echo "✅ pmp-database-url secret updated."

# 5. Build and deploy API
echo "🔨 Building API container..."
API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${GAR_REPO}/${API_SERVICE_NAME}:latest"
gcloud builds submit backend --tag "$API_IMAGE" --project="$PROJECT_ID"

echo "🚀 Deploying ${API_SERVICE_NAME} to Cloud Run..."
gcloud run deploy "$API_SERVICE_NAME" \
  --image="$API_IMAGE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --ingress=all \
  --port=8000 \
  --memory=2Gi \
  --cpu=2 \
  --concurrency=80 \
  --timeout=300 \
  --add-cloudsql-instances="$CLOUD_SQL_INSTANCE" \
  --set-env-vars="ENVIRONMENT=production,DEBUG=false,APP_NAME=Project Management Platform API,RUN_MIGRATIONS_ON_STARTUP=true,INIT_ADMIN_ON_STARTUP=true,SKIP_DB_WAIT=true,POSTGRES_HOST=/cloudsql/${CLOUD_SQL_INSTANCE},S3_ENDPOINT_URL=https://storage.googleapis.com,S3_BUCKET=${STORAGE_BUCKET},S3_REGION=${REGION},S3_USE_SSL=true,REALTIME_BACKPLANE_ENABLED=false" \
  --set-secrets="DATABASE_URL=pmp-database-url:latest,JWT_SECRET=pmp-jwt-secret:latest,SEED_ADMIN_PASSWORD=pmp-seed-admin-password:latest,S3_ACCESS_KEY=pmp-s3-access-key:latest,S3_SECRET_KEY=pmp-s3-secret-key:latest"

API_URL=$(gcloud run services describe "$API_SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format="value(status.url)")
echo "✅ API deployed at: $API_URL"

# 6. Build and deploy Frontend
echo "🔨 Building Frontend container (pointing to $API_URL)..."
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${GAR_REPO}/${FRONTEND_SERVICE_NAME}:latest"

gcloud builds submit frontend \
  --tag "$FRONTEND_IMAGE" \
  --project="$PROJECT_ID"

echo "🚀 Deploying ${FRONTEND_SERVICE_NAME} to Cloud Run..."
gcloud run deploy "$FRONTEND_SERVICE_NAME" \
  --image="$FRONTEND_IMAGE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --ingress=all \
  --port=3000 \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=80 \
  --timeout=300 \
  --set-env-vars="INTERNAL_API_URL=${API_URL},NODE_ENV=production"

FRONTEND_URL=$(gcloud run services describe "$FRONTEND_SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format="value(status.url)")
echo "✅ Frontend deployed at: $FRONTEND_URL"

# 7. Update CORS on API to allow Frontend URL
echo "🔄 Updating CORS origins on ${API_SERVICE_NAME}..."
gcloud run services update "$API_SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="CORS_ALLOWED_ORIGINS=[\"${FRONTEND_URL}\",\"http://localhost:3000\"]"

echo "========================================================"
echo "🎉 DEPLOYMENT COMPLETE!"
echo "API URL:      $API_URL"
echo "Frontend URL: $FRONTEND_URL"
echo "========================================================"
