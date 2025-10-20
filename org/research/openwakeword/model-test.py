import openwakeword
import numpy as np
from pydub import AudioSegment
from openwakeword.model import Model
from openwakeword.utils import bulk_predict
import tempfile, os

# download processing models and sample-voice models!
openwakeword.utils.download_models()

oww = Model(
    wakeword_models=["../../client/models/hey_rhasspy_v0.1.onnx"],
    # wakeword_models=["../../client/models/hey_twi_bot_v3.onnx"],
    inference_framework="onnx"
)
# src_path = "../../audios/wakeword/twi-bot/hey-twi-bot-16k.wav"
src_path = "../../audios/wakeword/rhasspy/elevenlabs-hey-rassphy-1-16k.wav"
audio = AudioSegment.from_file(src_path)
audio = audio.set_channels(1).set_frame_rate(16000).set_sample_width(2)  # 16bit PCM

# In temporäre WAV-Datei schreiben
with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
    audio.export(tmp.name, format="wav")
    tmp_path = tmp.name

# === Prediction ===
results = oww.predict_clip(tmp_path)

# Temp-Datei aufräumen
os.remove(tmp_path)

print("\nWakeword Detection Report")
print("=" * 50)
max_score = 0.0
for i, frame_pred in enumerate(results):
    for model, score in frame_pred.items():
        score = float(score)
        bar = "=" * int(score * 50)
        print(f"Frame {i:04d} | {model:20} | {score:.4f} | {bar}")
        if score > max_score:
            max_score = score
