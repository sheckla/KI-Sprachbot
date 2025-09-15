# emotion.py  -- ONLY JSON to stdout
import os, sys, json, warnings
os.environ["TRANSFORMERS_VERBOSITY"] = "error"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
warnings.filterwarnings("ignore")

from transformers.utils.logging import set_verbosity_error
set_verbosity_error()

from transformers import pipeline

try:
    clf = pipeline("audio-classification", model="superb/wav2vec2-base-superb-er", device=-1)
    res = clf(sys.argv[1], top_k=None)
    # reine JSON-Liste:
    print(json.dumps(res), flush=True)
except Exception as e:
    # sauberes Fehlerobjekt
    print(json.dumps({"__error__": str(e)}), flush=True)
    sys.exit(1)
