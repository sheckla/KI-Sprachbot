#!/bin/bash
VENV_PATH="$HOME/coqui-venv"
source "$VENV_PATH/bin/activate"
# nop = continue after closing bash
# & = start in background
nohup tts-server --model_name "tts_models/multilingual/multi-dataset/xtts_v2" --language_idx de --port 5005 &
nohup tts-server --model_name "tts_models/de/thorsten/vits" --port 5006 &
