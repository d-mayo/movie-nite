// The credit for every recorded sound the app ships: the Credits dialog lists it, and
// credits.test.ts keeps it in step with the MP3 files and with README.md.
export interface SoundCredit {
  file: string
  what: string
  source: string
  sourceUrl: string
  author: string
  license: 'CC0' | 'CC BY 4.0' | 'Public domain'
}

export const soundCredits: SoundCredit[] = [
  {
    file: 'projector-on.mp3',
    what: 'Projector switch-on',
    source: '702451, overhead projector',
    sourceUrl: 'https://freesound.org/people/Stefan021/sounds/702451/',
    author: 'Stefan021',
    license: 'CC0',
  },
  {
    file: 'projector-hum.mp3',
    what: 'Projector hum',
    source: '412145, 8 mm projector long run with finish',
    sourceUrl: 'https://freesound.org/people/Stefan021/sounds/412145/',
    author: 'Stefan021',
    license: 'CC0',
  },
  {
    file: 'projector-off.mp3',
    what: 'Projector switch-off',
    source: '412145, 8 mm projector long run with finish',
    sourceUrl: 'https://freesound.org/people/Stefan021/sounds/412145/',
    author: 'Stefan021',
    license: 'CC0',
  },
  {
    file: 'music-loop.mp3',
    what: 'Spin music',
    source: 'Entrance of the Gladiators, by Julius Fučík',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Julius_Fu%C4%8D%C3%ADk\'s_%22Entrance_of_the_Gladiators%22,_performed_by_the_U.S._Marine_Band.oga',
    author: 'U.S. Marine Band',
    license: 'Public domain',
  },
  {
    file: 'stinger.mp3',
    what: 'Winner fanfare',
    source: '578572, Congrats! 2',
    sourceUrl: 'https://freesound.org/people/nomiqbomi/sounds/578572/',
    author: 'nomiqbomi',
    license: 'CC0',
  },
  {
    file: 'applause.mp3',
    what: 'Applause',
    source: '859009, Small Auditorium Crowd Applause and Cheering',
    sourceUrl: 'https://freesound.org/people/elevatorfan2020/sounds/859009/',
    author: 'ElevatorFan2020',
    license: 'CC0',
  },
  {
    file: 'gasp.mp3',
    what: 'Close-call gasp',
    source: '764320, CRWDReac Crowd Gasping In Surprise, Voiced 02',
    sourceUrl: 'https://freesound.org/people/ShangusBurger/sounds/764320/',
    author: 'ShangusBurger',
    license: 'CC0',
  },
  {
    file: 'drumroll.mp3',
    what: 'Close-call drumroll',
    source: '191718, drumroll',
    sourceUrl: 'https://freesound.org/people/adriann/sounds/191718/',
    author: 'adriann',
    license: 'CC0',
  },
  {
    file: 'cymbal.mp3',
    what: 'Close-call cymbal',
    source: '191718, drumroll',
    sourceUrl: 'https://freesound.org/people/adriann/sounds/191718/',
    author: 'adriann',
    license: 'CC0',
  },
  {
    file: 'cheer.mp3',
    what: 'Close-call cheer',
    source: '430046, crowd cheer',
    sourceUrl: 'https://freesound.org/people/beeproductive/sounds/430046/',
    author: 'beeproductive',
    license: 'CC0',
  },
  {
    file: 'distorted-loop.mp3',
    what: 'Wildcard landing music',
    source: 'Entrance of the Gladiators, by Julius Fučík, run through a worn projector',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Julius_Fu%C4%8D%C3%ADk\'s_%22Entrance_of_the_Gladiators%22,_performed_by_the_U.S._Marine_Band.oga',
    author: 'U.S. Marine Band',
    license: 'Public domain',
  },
  {
    file: 'ambience.mp3',
    what: 'Wildcard wheel ambience',
    source: '412145, 8 mm projector long run with finish, under a slowed Entrance of the Gladiators (public domain)',
    sourceUrl: 'https://freesound.org/people/Stefan021/sounds/412145/',
    author: 'Stefan021',
    license: 'CC0',
  },
  {
    file: 'run-out.mp3',
    what: 'Reel running out',
    source: '412145, 8 mm projector long run with finish',
    sourceUrl: 'https://freesound.org/people/Stefan021/sounds/412145/',
    author: 'Stefan021',
    license: 'CC0',
  },
  {
    file: 'clunk.mp3',
    what: 'Reel change clunk',
    source: '702451, overhead projector',
    sourceUrl: 'https://freesound.org/people/Stefan021/sounds/702451/',
    author: 'Stefan021',
    license: 'CC0',
  },
  {
    file: 'clap.mp3',
    what: 'Clapper slam',
    source: '579205, Clap at Two Church 6',
    sourceUrl: 'https://freesound.org/people/jonsept/sounds/579205/',
    author: 'jonsept',
    license: 'CC0',
  },
  {
    file: 'knock.mp3',
    what: 'Film can knock',
    source: '698129, metal click',
    sourceUrl: 'https://freesound.org/people/ChristianStuck/sounds/698129/',
    author: 'ChristianStuck',
    license: 'CC BY 4.0',
  },
]
