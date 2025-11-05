source ~/ttsvenv312/bin/activate
pip install speechbrain torch librosa
ffmpeg -i input.wav -ac 1 -ar 16000 output.wav

Dann main.py mit Audiodatei als Eingabeparameter nutzen
python main.py ../audios/lena-thorsten-neutral.wav
