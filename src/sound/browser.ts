import { createSound, type SoundEngine, type SoundName } from './engine.ts'
import onUrl from '../assets/sound/projector-on.mp3'
import humUrl from '../assets/sound/projector-hum.mp3'
import offUrl from '../assets/sound/projector-off.mp3'
import loopUrl from '../assets/sound/music-loop.mp3'
import stingerUrl from '../assets/sound/stinger.mp3'
import applauseUrl from '../assets/sound/applause.mp3'
import gaspUrl from '../assets/sound/gasp.mp3'
import drumrollUrl from '../assets/sound/drumroll.mp3'
import cymbalUrl from '../assets/sound/cymbal.mp3'
import cheerUrl from '../assets/sound/cheer.mp3'
import dloopUrl from '../assets/sound/distorted-loop.mp3'
import ambienceUrl from '../assets/sound/ambience.mp3'
import runoutUrl from '../assets/sound/run-out.mp3'
import clunkUrl from '../assets/sound/clunk.mp3'
import clapUrl from '../assets/sound/clap.mp3'
import knockUrl from '../assets/sound/knock.mp3'

const urls: Record<SoundName, string> = {
  on: onUrl,
  hum: humUrl,
  off: offUrl,
  loop: loopUrl,
  stinger: stingerUrl,
  applause: applauseUrl,
  gasp: gaspUrl,
  drumroll: drumrollUrl,
  cymbal: cymbalUrl,
  cheer: cheerUrl,
  dloop: dloopUrl,
  ambience: ambienceUrl,
  runout: runoutUrl,
  clunk: clunkUrl,
  clap: clapUrl,
  knock: knockUrl,
}

type AudioContextConstructor = typeof AudioContext

// The sound engine on the browser's Web Audio, with the sound files from
// `src/assets/sound/`; silent where there is no Web Audio (jsdom).
export function createBrowserSound(): SoundEngine {
  return createSound({
    createContext() {
      const Context: AudioContextConstructor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
      return Context ? new Context() : null
    },
    load: (name) => fetch(urls[name]).then((response) => response.arrayBuffer()),
  })
}
