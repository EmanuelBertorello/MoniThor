FROM python:3.11-slim-bookworm

WORKDIR /app

RUN pip install --no-cache-dir playwright==1.46.0 python-dotenv==1.0.1
RUN playwright install --with-deps chromium

COPY facebook_scraper.py ./

ENTRYPOINT ["python", "facebook_scraper.py"]
