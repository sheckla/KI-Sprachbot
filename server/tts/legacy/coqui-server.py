#!/usr/bin/env python3
import os, hashlib, base64, uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from TTS.api import TTS

MODEL_DEFAULT = "tts_models/de/thorsten/vits"
DEVICE = "cpu"  # MPS/CPU ok, kein CUDA auf macOS ARM
CACHE_DIR = os.environ.get("COQUI_CACHE", "/tmp/coqui-cache")
os.makedirs(CACHE_DIR, exist_ok=True)

print("Loading TTS model…")
tts = TTS(model_name=MODEL_DEFAULT, progress_bar=False).to(DEVICE)
print("Model ready.")

app = FastAPI()

class SynthesisReq(BaseModel):
    text: str
    model: str | None = None
    speaker: str | None = None

@app.post("/synthesize")
def synthesize(req: SynthesisReq):
    text = (req.text or "").strip()
    if not text:
        return {"ok": False, "error": "no text provided"}

    model = req.model or MODEL_DEFAULT
    speaker = req.speaker

    key = hashlib.sha256(f"{model}|{speaker}|{text.lower()}|{DEVICE}".encode("utf-8")).hexdigest()
    wav_path = os.path.join(CACHE_DIR, f"{key}.wav")
    if not os.path.exists(wav_path):
        tts.tts_to_file(
            text=text,
            file_path=wav_path,
            speaker=speaker,
            model_name=model,  # erlaubt Hot-Swap auf anderes Modell, wird intern gecacht
            split_sentences=True
        )

    with open(wav_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return {"ok": True, "format": "wav", "audio_data_url": f"data:audio/wav;base64,{b64}"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5025, workers=1)
