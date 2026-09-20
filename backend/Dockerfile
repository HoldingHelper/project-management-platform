FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# build-essential: for any sdist-only wheels; netcat: entrypoint DB wait.
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends build-essential netcat-openbsd && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/var/logs && chmod +x docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
# Single worker on purpose: the audit event bus and WebSocket ConnectionManager
# are in-process singletons (cross-process fan-out would need the Redis pub/sub
# backplane, which isn't wired yet). Scale out via replicas, not workers.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
