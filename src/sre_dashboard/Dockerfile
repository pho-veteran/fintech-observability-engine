FROM python:3.10-slim

RUN useradd -u 10001 -m appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app/sre_dashboard
ENV PYTHONPATH=/app

USER appuser
EXPOSE 8001

CMD ["uvicorn", "sre_dashboard.app:app", "--host", "0.0.0.0", "--port", "8001"]
