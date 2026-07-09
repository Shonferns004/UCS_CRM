import os
import base64
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from paddleocr import PaddleOCR
from io import BytesIO

app = FastAPI(title="PaddleOCR Service")

ocr = PaddleOCR(
    use_angle_cls=True,
    lang='en',
    show_log=False,
    use_gpu=False,
)

class ImageData(BaseModel):
    image: str

def decode_image(image_str: str) -> bytes:
    if 'base64,' in image_str:
        image_str = image_str.split('base64,')[1]
    return base64.b64decode(image_str)

@app.post("/ocr")
async def parse_image(data: ImageData):
    try:
        img_bytes = decode_image(data.image)
        result = ocr.ocr(img_bytes, cls=True)

        lines = []
        if result and isinstance(result, list):
            for page in result:
                if page is None:
                    continue
                for detection in page:
                    text = detection[1][0]
                    confidence = detection[1][1]
                    if confidence >= 0.5:
                        lines.append(text)

        return {"text": "\n".join(lines)}
    except Exception as e:
        return {"text": "", "error": str(e)}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
