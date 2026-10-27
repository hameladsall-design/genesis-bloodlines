# GENESIS: BLOODLINES — سلالات الدم

> A dark-fantasy dynasty simulator: genetic inheritance, base building, RPG combat, and permanent death.

محاكاة سلالة في عالم فانتازيا مظلمة. بعد "الالتقاء الكبير" تصطدم العوالم، فتصير بقايا الإمبراطوريات والمعابد والتنانين مجتمعةً في مكان واحد. أنت **المؤسس الأول**: ناجٍ بشري وحيد يحمل بذرة سلالة لم تُولد بعد. اجمع الطعام، ابنِ سلالة، ولا تدع الجوع أو ساحة الترتيب يصنعا موتك النهائي.

**اللغة الأساسية: العربية (من اليمين إلى اليسار).** الإنجليزية متاحة من الإعدادات.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest acceptance + unit suites
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the production build
```

### Toolchain note

This repository was developed on a machine without a system Node install. A
workspace-local toolchain lives in `.toolchain/` (git-ignored):

```powershell
$env:PATH = "$PWD\.toolchain\node;$PWD\.toolchain\bin;" + $env:PATH
& ".\node_modules\.bin\vitest.cmd" run
```

If you have a normal Node 18+ install, just use `npm` as usual — nothing in the
project depends on the local toolchain.

---

## The loop

```
Gather  →  Feed the household  →  Upgrade the base  →  Recruit & marry
   ↑                                                      ↓
   └──────  Fight (food, loot, XP)  ←────────────  Expand the bloodline
```

Every system below is wired into one shared clock. Nothing is simulated in a
menu; the base is a physical place on the world map.

### The systems

| System | What it actually does |
|---|---|
| **Genetics** | A real genotype model: `locus → [alleleA, alleleB]`. Dominant traits express if any locus carries them, recessive only if all do, polygenic above a threshold. Inheritance probabilities are computed by enumerating gametes — never hard-coded. |
| **Family tree** | Parents, children, siblings, partners, ancestors and descendants across unlimited generations. The dead stay on the record. |
| **Food** | Exactly **1 food per living character per in-game day**. Visible in the HUD with days of supply remaining. |
| **Starvation** | Progressive, never instant: a warning, then a grace period, then health loss, then unrest and decaying buildings, and only at the extreme does a settlement collapse. |
| **Base** | 10 ranks from Basic Shelter to Kingdom Capital. Each raises capacity, expands the build area and unlocks buildings. Costs are shown in full and validated before anything is spent. |
| **Buildings** | 64 functionally distinct structures across 10 categories — housing, farms, workshops, barracks, walls, temples, arcane and race-specific buildings. |
| **Combat** | Two clearly separate modes. **Normal**: up to 10 of your own family; the defeated are incapacitated and recover. **Ranked**: death is permanent, recorded, and survives save/reload. |
| **Tavern** | A rotating roster of candidates across many species. Common recruits cost **10 coins**; rarer ones cost more. Recruit-to-household and marriage are separate actions. |
| **Visitors** | Roughly once per in-game month a stranger appears in the world with a red exclamation mark, offering exactly three choices: recruit, kill, send away. |
| **Levels & aging** | Per-character XP, levels, stat growth, species-specific lifespans, disease, injury and death by old age — all on the unified clock. |

---

## Architecture

```
src/
  game/
    simulation/        # source of truth — no Phaser, no DOM
      types.ts         # every shared contract in one place
      rng.ts           # seeded, deterministic randomness
      calendar.ts      # the one clock (12 months x 30 days)
      store.ts         # state + event bus
      save.ts          # save slots, autosave, migration
      engine.ts        # drives every time-dependent system
      systems/         # genetics, family, economy, combat, tavern, ...
    content/           # authored data: species, traits, buildings, enemies
  phaser/              # thin view layer: scenes, sprites, camera, weather
  ui/                  # DOM interface: HUD + panels, Arabic RTL
  i18n/                # bilingual helper with locale-override support
tests/                 # vitest: unit suites + the 33-point acceptance suite
```

**Rules of the codebase**

1. Gameplay state lives in `simulation/` and is serialisable. Phaser sprites and DOM
   nodes are disposable views, never storage.
2. Scenes read state and emit intents. They never decide outcomes.
3. Everything random is drawn from the seeded RNG, so a seed reproduces a world.
4. One clock. Aging, food, farming, construction, healing, pregnancy, visitors,
   quests and factions all read from it.
5. Stable IDs everywhere, so a ranked death, a hired candidate or a visiting
   stranger can never be resurrected or duplicated by a reload.

---

## Art

There are no binary art assets. Every sprite is generated procedurally at boot
from pixel grids and a shared palette (charcoal, blood red, muted gold, forest
green, bruised blue) in `src/phaser/view/sprites.ts`. That keeps the project
text-only and the whole game visually coherent — and swapping in real art later
only means replacing the texture factories.

---

## Localization

Arabic is the default (`dir="rtl"`). Every string is written inline as
`t(key, 'النص العربي', 'English text')`, so translations live next to the call
site and adding a full English locale file later is a drop-in
(`src/i18n/registry.ts` → `registerOverrides`). The UI direction flips automatically.

---

## License

MIT. See [LICENSE](LICENSE).
