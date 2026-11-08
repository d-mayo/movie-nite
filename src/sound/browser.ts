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
import runoutUrl from '../assets/sound/run-out.mp3'
import clunkUrl from '../assets/sound/clunk.mp3'
import clapUrl from '../assets/sound/clap.mp3'
import knockUrl from '../assets/sound/knock.mp3'
import christmasLoopUrl from '../assets/sound/christmas-loop.mp3'
import christmasStingerUrl from '../assets/sound/christmas-stinger.mp3'
import christmasWin1Url from '../assets/sound/christmas-win-1.mp3'
import christmasWin2Url from '../assets/sound/christmas-win-2.mp3'
import christmasWin3Url from '../assets/sound/christmas-win-3.mp3'
import christmasWin4Url from '../assets/sound/christmas-win-4.mp3'
import christmasBellsUrl from '../assets/sound/christmas-bells.mp3'

// An imported MP3 is only a URL: a seasonal file is fetched when the engine asks for it, while its season is active.
const urls: Partial<Record<SoundName, string>> = {
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
  runout: runoutUrl,
  clunk: clunkUrl,
  clap: clapUrl,
  knock: knockUrl,
  'christmas-loop': christmasLoopUrl,
  'christmas-stinger': christmasStingerUrl,
  'christmas-win-1': christmasWin1Url,
  'christmas-win-2': christmasWin2Url,
  'christmas-win-3': christmasWin3Url,
  'christmas-win-4': christmasWin4Url,
  'christmas-bells': christmasBellsUrl,
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
    load(name) {
      const url = urls[name]
      return url ? fetch(url).then((response) => response.arrayBuffer()) : Promise.reject(new Error(`No file for ${name}`))
    },
  })
}
