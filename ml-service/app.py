import base64
import os
import io
import time

import easyocr
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify

from extractor import extract_structured_data

app = Flask(__name__)

reader = None


def get_reader():
    global reader
    if reader is None:
        gpu = os.environ.get('EASYOCR_GPU', 'false').lower() == 'true'
        reader = easyocr.Reader(['en'], gpu=gpu)
    return reader


def preprocess_image(img):
    img = img.convert('L')
    img = img.point(lambda x: 0 if x < 140 else 255)
    return img


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/ocr', methods=['POST'])
def ocr():
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'text': '', 'error': 'image is required'}), 400

        base64_str = data['image']
        if ',' in base64_str:
            base64_str = base64_str.split(',')[1]

        img_bytes = base64.b64decode(base64_str)
        img = Image.open(io.BytesIO(img_bytes))

        reader = get_reader()
        results = reader.readtext(np.array(img), detail=0, paragraph=True)
        text = '\n'.join(results).strip()

        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'text': '', 'error': str(e)}), 500


@app.route('/extract', methods=['POST'])
def extract():
    start = time.time()
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'data': None, 'error': 'image is required'}), 400

        base64_str = data['image']
        if ',' in base64_str:
            base64_str = base64_str.split(',')[1]

        img_bytes = base64.b64decode(base64_str)
        img = Image.open(io.BytesIO(img_bytes))

        reader = get_reader()
        raw_results = reader.readtext(np.array(img), detail=0, paragraph=True)
        raw_text = '\n'.join(raw_results).strip()

        extracted = extract_structured_data(raw_text)

        elapsed = time.time() - start
        extracted['_ocr_time_ms'] = round(elapsed * 1000)
        extracted['_ocr_engine'] = 'easyocr'

        return jsonify({'data': extracted, 'raw_text': raw_text})
    except Exception as e:
        return jsonify({'data': None, 'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 9000))
    print(f"ML service starting on port {port}...")
    print("Loading EasyOCR model (first load downloads ~100MB)...")
    get_reader()
    print("EasyOCR model loaded.")
    app.run(host='0.0.0.0', port=port)
