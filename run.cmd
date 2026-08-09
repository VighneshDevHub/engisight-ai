MinIO - .\minio.exe server C:\minio-data --console-address ":9001"
Qdrant - .\qdrant.exe
Backend	- uvicorn app.main:app --reload
Celery - $env:PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION="python" 
         celery -A app.core.celery_app worker --loglevel=info --pool=solo

Frontend - npm run dev