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
| `music-loop.mp3` | [Fučík's *Entrance of the Gladiators*, U.S. Marine Band](https://commons.wikimedia.org/wiki/File:Julius_Fu%C4%8D%C3%ADk's_%22Entrance_of_the_Gladiators%22,_performed_by_the_U.S._Marine_Band.oga) on Wikimedia Commons (an Ogg Vorbis file in `sound-sources/`), public domain, no credit needed | 10.0 to 42.12, with the main body starting at 12.0 |
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

Remake (ffmpeg, from `sound-sources/`, with `GLAD.ogg` the Commons file;
the second command appends the 0.1 s margin):

```
ffmpeg -i GLAD.ogg -filter_complex "[0:a]atrim=10:42.12,asetpts=PTS-STARTPTS,afade=t=in:d=0.02[a];[0:a]atrim=11:12,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=1:c1=tri:c2=tri,aformat=channel_layouts=stereo[o]" -map "[o]" -c:a libmp3lame -b:a 96k loop.mp3
ffmpeg -i loop.mp3 -filter_complex "[0:a]asplit=2[f][w];[w]atrim=2.0:2.1,asetpts=PTS-STARTPTS[post];[f][post]concat=n=2:v=0:a=1[o]" -map "[o]" -c:a libmp3lame -b:a 96k music-loop.mp3
```

# Close-call sounds

Three mono 64 kbps MP3s (44.1 kHz) and a stereo 96 kbps cheer, none needing a credit: all the sources are CC0. Originals live in
the gitignored `sound-sources/`. Times are seconds in the source file. Total shipped: about 63 KB, plus the cheer's 84 KB.

| File | Source | Cut |
| --- | --- | --- |
| `gasp.mp3` | [764320, CRWDReac Crowd Gasping In Surprise, Voiced 02](https://freesound.org/people/ShangusBurger/sounds/764320/) by ShangusBurger, CC0 | 0.8 to 2.85, the gasp itself; 50 ms fade in, 450 ms fade out, loudness-normalized to -18 LUFS |
| `drumroll.mp3` | [191718, drumroll](https://freesound.org/people/adriann/sounds/191718/) by adriann, CC0 (a 5.97 s mono 8-bit clip: a roll that builds, then a crash from about 3.75) | 0.4 to 3.74 with the crescendo flattened (dynaudnorm), then 1.2 to 2.8 of that looped: the last 0.5 s cross-fades into the start, 0.1 s margin each side, so `loopStart` = 0.1 and `loopEnd` = 1.7; the engine ramps its level up through the approach |
| `cheer.mp3` | [430046, crowd cheer](https://freesound.org/people/beeproductive/sounds/430046/) by beeproductive, CC0 (a 15.95 s stereo clip) | 0 to 7.0, the cheer's rise and first sustain; 20 ms fade in, 1.5 s fade out. Played over the applause on a close call |
| `cymbal.mp3` | the same file | 3.74 to 5.97, the crash and its tail; 5 ms fade in, 700 ms fade out |

Remake (ffmpeg, from `sound-sources/`, with `GASP.wav` and `ROLL.wav` the two source files):

```
ffmpeg -ss 0.8 -t 2.05 -i GASP.wav -af "afade=t=in:d=0.05,afade=t=out:st=1.6:d=0.45,loudnorm=I=-18:TP=-2" -ac 1 -ar 44100 -c:a libmp3lame -b:a 64k gasp.mp3
ffmpeg -ss 0.4 -t 3.34 -i ROLL.wav -af "dynaudnorm=f=150:g=7:p=0.9:m=30,aresample=44100" -ac 1 roll-flat.wav
ffmpeg -i roll-flat.wav -filter_complex "[0:a]atrim=1.2:3.34,asetpts=PTS-STARTPTS,asplit=2[a][b];[a]atrim=1.6:2.1,asetpts=PTS-STARTPTS[tail];[b]atrim=0:1.6,asetpts=PTS-STARTPTS[full];[tail][full]acrossfade=d=0.5:c1=tri:c2=tri,asplit=3[b1][b2][b3];[b1]atrim=1.5:1.6,asetpts=PTS-STARTPTS[pre];[b3]atrim=0:0.1,asetpts=PTS-STARTPTS[post];[pre][b2][post]concat=n=3:v=0:a=1,loudnorm=I=-20:TP=-2[o]" -map "[o]" -ac 1 -ar 44100 -c:a libmp3lame -b:a 64k drumroll.mp3
ffmpeg -ss 3.74 -t 2.23 -i ROLL.wav -af "afade=t=in:d=0.005,afade=t=out:st=1.5:d=0.7,aresample=44100" -ac 1 -ar 44100 -c:a libmp3lame -b:a 64k cymbal.mp3
ffmpeg -t 7 -i CHEER.wav -af "afade=t=in:d=0.02,afade=t=out:st=5.5:d=1.5,aresample=44100" -c:a libmp3lame -b:a 96k cheer.mp3
```

# Wildcard wheel sounds

Six more MP3s. Originals live in the gitignored `sound-sources/`; the processing scripts were one-off Python (numpy, scipy) and ffmpeg. Times are seconds in the source file. The files together are about 770 KB.

| File | Source | Cut |
| --- | --- | --- |
| `distorted-loop.mp3` | the same Commons recording of Fučík's *Entrance of the Gladiators* as `music-loop.mp3` ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Julius_Fu%C4%8D%C3%ADk's_%22Entrance_of_the_Gladiators%22,_performed_by_the_U.S._Marine_Band.oga)), public domain, U.S. Marine Band | the music loop's cut (10 to 42.12 with its cross-fade) played through a film-reel simulation: the speed wanders (a slow drift, a faster flutter and a few drags that slow it down and catch up, periodic over the body so the loop still closes), then a narrow optical-soundtrack band, fuzz, 24 fps gate flicker, dropouts, hiss, dust ticks and splice thumps. Same loop points as the music loop: `loopStart` = 2.0, `loopEnd` = 32.12, 0.1 s margin appended, mono 80 kbps |
| `ambience.mp3` | the same recording (the main body, 2.0 to 32.12 of the cut) and the projector hum of 412145 ([Stefan021](https://freesound.org/people/Stefan021/sounds/412145/), CC0) | the body slowed to half speed and an octave down (`asetrate`), low-passed to 1.1 kHz with a short echo, over the hum low-passed to 650 Hz at a fifth of the music's level, with hiss and dust; the last 2 s cross-fade into the first 2 s so it closes: `loopStart` = 0, `loopEnd` = 60.54, 0.1 s margin appended, mono 48 kbps |
| `run-out.mp3` | [412145, 8 mm projector long run with finish](https://freesound.org/people/Stefan021/sounds/412145/) by Stefan021, CC0 | 92.9 to 95.3, the run-out's flapping tail; +12 dB then limited to 0.8, 350 ms fade in, 1.2 s fade out from 1.2 s, mono 64 kbps |
| `clunk.mp3` | [702451, overhead projector](https://freesound.org/people/Stefan021/sounds/702451/) by Stefan021, CC0 | 1.38 to 1.83, the second clunk; +10 dB then limited to 0.8, mono 64 kbps |
| `clap.mp3` | [579205, Clap at Two Church 6](https://freesound.org/people/jonsept/sounds/579205/) by jonsept, CC0 | the whole 1.53 s clap with a sharper snap (high-passed copy added, soft clip), a 2.4 s synthesized reverb tail, a low pitch-dropping thump and two slapback echoes, then an 0.8 s fade; stereo 96 kbps |

`knock.mp3` is the one sound that needs a credit: [698129, metal click](https://freesound.org/people/ChristianStuck/sounds/698129/) by ChristianStuck, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The whole 0.3 s click with a 50 ms fade out, mono 64 kbps; the Credits dialog carries the credit.
