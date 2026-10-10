import { createSound, type SoundEngine, type SoundName } from './engine.ts'
import onUrl from '../assets/sound/projector-on.mp3'
import humUrl from '../assets/sound/projector-hum.mp3'
import offUrl from '../assets/sound/projector-off.mp3'

const urls: Record<SoundName, string> = { on: onUrl, hum: humUrl, off: offUrl }

type AudioContextConstructor = typeof AudioContext

// The sound engine on the browser's Web Audio, with the projector files from
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
