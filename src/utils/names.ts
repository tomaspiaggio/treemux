const adjectives = [
  "gentle", "bright", "swift", "calm", "bold", "warm", "cool", "wild",
  "keen", "soft", "deep", "light", "dark", "fresh", "crisp", "quick",
  "quiet", "vivid", "clear", "grand", "still", "brave", "pure", "rare",
  "neat", "fair", "fine", "wise", "late", "lean", "rich", "slim",
]

const nouns = [
  "morning", "river", "cloud", "storm", "flame", "frost", "dawn",
  "ocean", "stone", "bloom", "maple", "cedar", "ridge", "creek",
  "grove", "cliff", "shore", "field", "spark", "ember", "coral",
  "valley", "marsh", "trail", "glade", "brook", "blade", "forge",
]

const animals = [
  "fox", "owl", "elk", "jay", "hawk", "wolf", "bear", "lynx",
  "dove", "swan", "crow", "wren", "frog", "moth", "hare", "deer",
  "seal", "mink", "kite", "lark", "newt", "vole", "mole", "ibis",
]

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function randomSuffix(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let s = ""
  for (let i = 0; i < 3; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export function generateBranchName(): string {
  return `${randomFrom(adjectives)}-${randomFrom(nouns)}-${randomFrom(animals)}-${randomSuffix()}`
}
