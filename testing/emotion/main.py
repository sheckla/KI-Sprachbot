import sys # argv access
from transformers import pipeline # huggingface lib


model = pipeline("audio-classification", model="superb/wav2vec2-base-superb-er", device=-1)
out = model(sys.argv[1])
print(out)
