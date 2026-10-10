# Projector sounds

Three mono MP3s cut from two CC0 recordings by Stefan021 on Freesound. The
original WAVs are not committed: keep them in `sound-sources/` (gitignored) to
remake the cuts. Times below are seconds in the source file.

| File | Source | Cut |
| --- | --- | --- |
| `projector-on.mp3` | [702451, overhead projector](https://freesound.org/people/Stefan021/sounds/702451/) (44.1 kHz mono) | 1.017 to 1.65: both clunks (the first rises at 1.020, the second at about 1.42); 2 ms fade in, 100 ms fade out |
| `projector-hum.mp3` | [412145, 8 mm projector long run with finish](https://freesound.org/people/Stefan021/sounds/412145/), mixed to mono | the steady run, 55.0 to 63.5 (the knocks at about 48.3, 79.8 and 87.5 are avoided), +6 dB |
| `projector-off.mp3` | the same file | 95.33 to 96.1: the final clicks; 4 ms fade in, 220 ms fade out |

## The hum loop

The loop body is 8.0 s: the 0.5 s after the body (63.0 to 63.5) cross-fades
(triangular) into the start, so the end of the body runs straight into its
start. The file is the body with 0.1 s of its own wrap on each side, 8.2 s in
all, so the encoder's padding falls in those margins:

- `loopStart` = 0.1
- `loopEnd` = 8.1

Remake (ffmpeg, from `sound-sources/`, with `mono48.wav` the long file mixed to
mono at 48 kHz):

```
ffmpeg -i mono48.wav -filter_complex "[0:a]atrim=55.0:63.5,asetpts=PTS-STARTPTS,volume=2,asplit=2[a][b];[a]atrim=8.0:8.5,asetpts=PTS-STARTPTS[tail];[b]atrim=0:8.0,asetpts=PTS-STARTPTS[full];[tail][full]acrossfade=d=0.5:c1=tri:c2=tri,asplit=3[b1][b2][b3];[b1]atrim=7.9:8.0,asetpts=PTS-STARTPTS[pre];[b3]atrim=0:0.1,asetpts=PTS-STARTPTS[post];[pre][b2][post]concat=n=3:v=0:a=1,aresample=44100[o]" -map "[o]" -ac 1 -c:a libmp3lame -b:a 96k projector-hum.mp3
```
