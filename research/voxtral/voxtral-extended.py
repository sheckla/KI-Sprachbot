import argparse, time, json, os
import torch
from transformers import VoxtralForConditionalGeneration, AutoProcessor, infer_device
import soundfile as sf

try:
    import psutil
except ImportError:
    psutil = None

REPO_ID = "mistralai/Voxtral-Mini-3B-2507"

def pick_dtype():
    # solide Defaults für Apple/CPU
    if torch.backends.mps.is_available():
        return torch.float16   # MPS mag bf16 oft nicht
    if torch.cuda.is_available():
        return torch.bfloat16  # oder torch.float16 je nach Karte
    return torch.float32       # CPU: stabil, nur langsamer

def mem_mb():
    if psutil:
        return int(psutil.Process(os.getpid()).memory_info().rss / (1024*1024))
    return None

def timeit(fn, *args, **kwargs):
    t0 = time.perf_counter()
    out = fn(*args, **kwargs)
    t1 = time.perf_counter()
    return out, (t1 - t0)

def load_model(dtype, device):
    # Processor
    processor, t_proc = timeit(AutoProcessor.from_pretrained, REPO_ID)
    # Model
    model, t_model = timeit(
        VoxtralForConditionalGeneration.from_pretrained,
        REPO_ID, dtype=dtype, device_map=infer_device()
    )
    return processor, model, t_proc, t_model

def decode_new_tokens(processor, outputs, input_len):
    # outputs: [B, total_len]; wir wollen nur die neu generierten Tokens
    gen_only = outputs[:, input_len:]
    text = processor.batch_decode(gen_only, skip_special_tokens=True)[0]
    return text, gen_only.shape[1]

def audio_duration_sec(path):
    try:
        info = sf.info(path)
        return float(info.frames) / float(info.samplerate)
    except Exception:
        return None

def bench_transcribe(audio, lang, max_new, dtype, device):
    # Laden
    processor, model, t_proc, t_model = load_model(dtype, device)
    base_mem = mem_mb()

    # Preproc (inkl. Audio-Load + Feature-Prep im Processor)
    def _prep():
        return processor.apply_transcription_request(
            language=lang, audio=audio, model_id=REPO_ID
        )
    inputs, t_prep = timeit(_prep)
    inputs = inputs.to(device, dtype=dtype)

    # Inferenz
    outputs, t_gen = timeit(model.generate, **inputs, max_new_tokens=max_new)

    # Decode
    input_len = inputs.input_ids.shape[1]
    text, gen_tokens = decode_new_tokens(processor, outputs, input_len)

    dur = audio_duration_sec(audio)
    rtf = (t_gen / dur) if (dur and dur > 0) else None
    tps = (gen_tokens / t_gen) if t_gen > 0 else None

    return {
        "mode": "transcribe",
        "audio": audio,
        "lang": lang,
        "dtype": str(dtype).replace("torch.", ""),
        "device": str(device),
        "metrics": {
            "load_processor_s": round(t_proc, 4),
            "load_model_s": round(t_model, 4),
            "prep_s": round(t_prep, 4),          # Audio laden + Features
            "gen_s": round(t_gen, 4),
            "audio_duration_s": round(dur, 3) if dur else None,
            "rtf": round(rtf, 3) if rtf else None,   # <1.0 ist schneller als Echtzeit
            "gen_tokens": int(gen_tokens),
            "tokens_per_s": round(tps, 2) if tps else None,
            "rss_mem_mb": base_mem
        },
        "text_preview": text[:300]
    }

def bench_llm_text(prompt, max_new, dtype, device):
    processor, model, t_proc, t_model = load_model(dtype, device)
    base_mem = mem_mb()

    # Preproc (reines Prompt → Tokens)
    def _prep():
        conversation = [{
            "role": "user",
            "content": [{"type": "text", "text": prompt}]
        }]
        return processor.apply_chat_template(conversation)
    inputs, t_prep = timeit(_prep)
    inputs = inputs.to(device, dtype=dtype)

    outputs, t_gen = timeit(model.generate, **inputs, max_new_tokens=max_new)

    input_len = inputs.input_ids.shape[1]
    text, gen_tokens = decode_new_tokens(processor, outputs, input_len)
    tps = (gen_tokens / t_gen) if t_gen > 0 else None

    return {
        "mode": "llm_text",
        "dtype": str(dtype).replace("torch.", ""),
        "device": str(device),
        "prompt_chars": len(prompt),
        "metrics": {
            "load_processor_s": round(t_proc, 4),
            "load_model_s": round(t_model, 4),
            "prep_s": round(t_prep, 4),
            "gen_s": round(t_gen, 4),
            "gen_tokens": int(gen_tokens),
            "tokens_per_s": round(tps, 2) if tps else None,
            "rss_mem_mb": base_mem
        },
        "text_preview": text[:300]
    }

def bench_audio_chat(audio, prompt, max_new, dtype, device):
    processor, model, t_proc, t_model = load_model(dtype, device)
    base_mem = mem_mb()

    def _prep():
        conversation = [{
            "role": "user",
            "content": [
                {"type": "audio", "path": audio},
                {"type": "text", "text": prompt},
            ]
        }]
        return processor.apply_chat_template(conversation)
    inputs, t_prep = timeit(_prep)
    inputs = inputs.to(device, dtype=dtype)

    outputs, t_gen = timeit(model.generate, **inputs, max_new_tokens=max_new)

    input_len = inputs.input_ids.shape[1]
    text, gen_tokens = decode_new_tokens(processor, outputs, input_len)

    dur = audio_duration_sec(audio)
    rtf = (t_gen / dur) if (dur and dur > 0) else None
    tps = (gen_tokens / t_gen) if t_gen > 0 else None

    return {
        "mode": "audio_chat",
        "audio": audio,
        "prompt_chars": len(prompt),
        "dtype": str(dtype).replace("torch.", ""),
        "device": str(device),
        "metrics": {
            "load_processor_s": round(t_proc, 4),
            "load_model_s": round(t_model, 4),
            "prep_s": round(t_prep, 4),      # inkl. Audio-Lesen + Tokenisierung
            "gen_s": round(t_gen, 4),
            "audio_duration_s": round(dur, 3) if dur else None,
            "rtf": round(rtf, 3) if rtf else None,
            "gen_tokens": int(gen_tokens),
            "tokens_per_s": round(tps, 2) if tps else None,
            "rss_mem_mb": base_mem
        },
        "text_preview": text[:300]
    }

def main():
    p = argparse.ArgumentParser("Voxtral Mini 3B Bench")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_asr = sub.add_parser("transcribe", help="Nur Transkription messen")
    p_asr.add_argument("audio", help="Pfad zu WAV/MP3 etc.")
    p_asr.add_argument("--lang", default="de")
    p_asr.add_argument("--max-new", type=int, default=512)

    p_txt = sub.add_parser("llm_text", help="Nur Text-LLM messen")
    p_txt.add_argument("prompt", help="Prompt-Text")
    p_txt.add_argument("--max-new", type=int, default=256)

    p_combo = sub.add_parser("audio_chat", help="Audio + Text-Frage messen")
    p_combo.add_argument("audio", help="Pfad zu Audio")
    p_combo.add_argument("prompt", help="Instruktion/Frage")
    p_combo.add_argument("--max-new", type=int, default=400)

    args = p.parse_args()

    device = infer_device()
    dtype = pick_dtype()

    if args.cmd == "transcribe":
        res = bench_transcribe(args.audio, args.lang, args.max_new, dtype, device)
    elif args.cmd == "llm_text":
        res = bench_llm_text(args.prompt, args.max_new, dtype, device)
    else:
        res = bench_audio_chat(args.audio, args.prompt, args.max_new, dtype, device)

    print(json.dumps(res, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
