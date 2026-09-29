FROM python:3.11-slim

WORKDIR /app

COPY . .
RUN pip install --no-cache-dir .

RUN mkdir -p /data
WORKDIR /data

ENTRYPOINT ["instaloader"]
