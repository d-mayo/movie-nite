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

# Music and win sounds

Three more MP3s, none needing a credit (stereo, 96 kbps for the loop). Originals live in the
gitignored `sound-sources/`. Times are seconds in the source file.

| File | Source | Cut |
| --- | --- | --- |
| `music-loop.mp3` | [Fučík's *Entrance of the Gladiators*, U.S. Marine Band](https://commons.wikimedia.org/wiki/File:Julius_Fu%C4%8D%C3%ADk's_%22Entrance_of_the_Gladiators%22,_performed_by_the_U.S._Marine_Band.oga) on Wikimedia Commons (an Ogg Vorbis file in `sound-sources/`), public domain, no credit needed | 10.0 to 44.12, with the main body starting at 12.0 |
| `stinger.mp3` | [578572, Congrats! 2](https://freesound.org/people/nomiqbomi/sounds/578572/) by nomiqbomi, CC0 | the whole 3.03 s file: a swell from about 0.75 and the main hit at about 1.65 |
| `applause.mp3` | [859009, Small Auditorium Crowd Applause and Cheering](https://freesound.org/people/elevatorfan2020/sounds/859009/) by ElevatorFan2020, CC0 | the whole 6.19 s file |

## The music loop

The file is a 2 s lead-in (10 to 12 in the source) then a 30.12 s body, the
tail of which (the last 1 s) cross-fades (triangular) into the 1 s before the
body, so the end of the body runs straight into its start. 0.1 s of the
body's start is appended after the end so the encoder's padding falls past the
loop:

- `loopStart` = 2.0
- `loopEnd` = 32.12

The first 20 ms fades in. Total shipped: loop 387 KB, stinger 65 KB,
applause 198 KB, about 650 KB.
