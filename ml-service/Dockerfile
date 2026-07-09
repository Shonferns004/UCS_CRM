FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=9000
ENV EASYOCR_GPU=false

EXPOSE 9000

CMD ["gunicorn", "--bind", "0.0.0.0:9000", "--workers", "1", "--timeout", "120", "app:app"]
