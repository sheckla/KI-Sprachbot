import torch
from transformers import VoxtralForConditionalGeneration, AutoProcessor, infer_device

device = infer_device()  # CPU/MPS/GPU automatisch
repo_id = "mistralai/Voxtral-Mini-3B-2507"

processor = AutoProcessor.from_pretrained(repo_id)
model = VoxtralForConditionalGeneration.from_pretrained(
    repo_id, dtype=torch.bfloat16, device_map=device
)
print('model geladen')
# Datei: lokal (z.B. "mein_audio.wav") oder URL
audio_path = "../audios/lena-thorsten-sleepy.wav"  # <-- anpassen

# Sprache optional angeben: z.B. "de" für Deutsch oder None für Auto
print('apply transcription request');
inputs = processor.apply_transcription_request(
    language="de", audio=audio_path, model_id=repo_id
).to(device, dtype=torch.bfloat16)
print('input applied')
print('Generating ...');
outputs = model.generate(**inputs, max_new_tokens=512)
text = processor.batch_decode(outputs[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0]
print(text)
