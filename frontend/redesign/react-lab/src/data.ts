export type AppProject = {
  name: string
  file: string
  branches: number
  state: "Has draft" | "Committed" | "Awaiting merge"
  last: string
  when: string
  merged: boolean
}

export const appProjects: AppProject[] = [
  { name: "Rainy Saigon Night", file: "dem-sai-gon-mua.mid", branches: 2, state: "Has draft", last: "Normalize velocity for pad…", when: "yesterday", merged: false },
  { name: "Morning bossa", file: "bossa-sang.mid", branches: 1, state: "Committed", last: "Add nylon guitar intro", when: "3 days ago", merged: false },
  { name: "Intro for the November EP", file: "intro-ep.mid", branches: 3, state: "Awaiting merge", last: "Try the bridge with a minor chord", when: "5 days ago", merged: false },
  { name: "Harmony exercise", file: "hoa-am.mid", branches: 1, state: "Committed", last: "Finish lesson 4", when: "2 weeks ago", merged: true },
]

export type PublicProject = {
  name: string
  file: string
  genre: string
  tempo: string
  author: string
  stars: number
  forks: number
  commits: number
  when: string
  branches: number
  merged: boolean
  gain: number
}

export const publicProjects: PublicProject[] = [
  { name: "Rainy Saigon Night", file: "dem-sai-gon-mua.mid", genre: "Lo-fi", tempo: "92 BPM · Am", author: "minhanh", stars: 214, forks: 31, commits: 18, when: "yesterday", branches: 3, merged: true, gain: 27 },
  { name: "Morning bossa", file: "bossa-sang.mid", genre: "Jazz", tempo: "118 BPM · Dm", author: "hoangvu", stars: 187, forks: 24, commits: 42, when: "2 days ago", branches: 2, merged: true, gain: 31 },
  { name: "Off-beat Nocturne", file: "nocturne-b.mid", genre: "Classical", tempo: "64 BPM · C#m", author: "trungduc", stars: 163, forks: 9, commits: 27, when: "3 days ago", branches: 1, merged: false, gain: 15 },
  { name: "Neon Highway", file: "neon-highway.mid", genre: "Electronic", tempo: "128 BPM · Fm", author: "thanhtri", stars: 151, forks: 40, commits: 55, when: "4 days ago", branches: 3, merged: true, gain: 38 },
  { name: "RPG theme", file: "rpg-theme.mid", genre: "Film score", tempo: "100 BPM · Em", author: "haipham", stars: 129, forks: 17, commits: 33, when: "5 days ago", branches: 2, merged: false, gain: 22 },
  { name: "Rainy afternoon in Hanoi", file: "chieu-mua-hn.mid", genre: "Lo-fi", tempo: "84 BPM · Gm", author: "minhanh", stars: 118, forks: 22, commits: 14, when: "1 week ago", branches: 2, merged: true, gain: 12 },
  { name: "Swing drums in 7/8", file: "swing-78.mid", genre: "Jazz", tempo: "140 BPM · Bb", author: "hoangvu", stars: 96, forks: 11, commits: 21, when: "1 week ago", branches: 1, merged: false, gain: 9 },
  { name: "Night arpeggio", file: "arp-night.mid", genre: "Electronic", tempo: "122 BPM · Am", author: "khanh", stars: 74, forks: 6, commits: 12, when: "2 weeks ago", branches: 2, merged: false, gain: 19 },
]

export const glossary = [
  ["Draft", "The piece you’re still writing. STAVE saves it every time you change a note.", "Like a rough take in the studio, not yet named."],
  ["Commit", "A point you save on purpose, with a message. Only commits enter the history.", "Like naming a mix: \"demo 1\", \"client mix\"."],
  ["Branches", "An experiment that runs alongside the main version without touching the original.", "Like trying a bridge with different chords."],
  ["Merge", "Combine what you changed on one branch into another, usually the main branch.", "Like picking the bridge you like and placing it into the main song."],
  ["Conflict", "When both branches edit the same note, STAVE doesn’t decide for you; it asks which version to keep, bar by bar.", "Like two people changing the third note of the same phrase."],
  ["Restore", "Go back to the contents of an older point by creating a new commit. The old history is not deleted.", "Like recreating an old mix as your newest one."],
  ["Fork and Pull request", "A fork copies someone else’s project so you can remix it. A pull request proposes your changes back to the original project.", "Like copying a friend’s song to rework it, then sending your version back for them to see."],
  ["Velocity and Quantize", "Velocity is how hard each note is played. Quantize snaps notes onto the grid’s beats.", "Like adjusting how hard keys are hit and fixing notes that fall off the beat."],
]
