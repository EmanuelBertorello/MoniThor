FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv

# Deps + browser install first (cached across src/ edits — only invalidated by pyproject.toml/uv.lock changes)
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-install-project
RUN uv run playwright install chromium
RUN uv run playwright install-deps chromium

# App code last — editing these skips the heavy layers above
COPY src/ ./src/
COPY cli/ ./cli/
COPY main.py ./
COPY config.ini ./
RUN uv sync --frozen

RUN mkdir -p data logs

ENTRYPOINT ["uv", "run", "python", "main.py"]
