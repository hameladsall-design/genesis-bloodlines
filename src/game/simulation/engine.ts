/**
 * The simulation engine.
 *
 * Owns the single in-game clock and drives every time-dependent system from
 * it. The engine is deliberately free of Phaser and DOM references so it can
 * be driven headlessly by the acceptance tests.
 */

import { advanceHours, daylightFactor, seasonOf } from './calendar';
import { GameStore } from './store';
import type { GameState, Id, Weather } from './types';
import { SaveManager } from './save';

// Systems owned by the core team.
import { createFactions } from './systems/factions';
import { createQuests } from './systems/quests';
import { tickAging } from './systems/progression';

// Systems provided by the feature modules.
import { tickProduction, tickConstruction, tickHealing, tickDisease, tickStarvation, consumeFood } from './systems/economy';
import { tickFactions } from './systems/factions';
import { tickQuests } from './systems/quests';
import { maybeSpawnVisitor } from './systems/visitors';
import { refreshTavern } from './systems/tavern';
import { tickPregnancy } from './systems/family';

export type TimeSpeed = 0 | 1 | 2 | 3;

/** Real milliseconds per in-game hour at each speed setting. */
export const HOURS_PER_SPEED: Record<TimeSpeed, number> = {
  0: 0,
  1: 2500,
  2: 800,
  3: 250,
};

/** How often the tavern roster rotates, in in-game days. */
export const TAVERN_ROTATION_DAYS = 5;
/** How often an automatic save is written, in in-game days. */
export const AUTOSAVE_DAYS = 3;

export class GameEngine {
  store: GameStore;
  speed: TimeSpeed = 1;
  private saveManager: SaveManager;
  private accumulatedMs = 0;
  /** Set when the simulation needs the view to redraw. */
  onDayComplete?: (day: number) => void;

  constructor(store: GameStore, saveManager?: SaveManager) {
    this.store = store;
    this.saveManager = saveManager ?? new SaveManager();
  }

  static fromState(state: GameState, saveManager?: SaveManager): GameEngine {
    return new GameEngine(new GameStore(state, state.config?.seed), saveManager);
  }

  get state(): GameState {
    return this.store.state;
  }

  setSpeed(speed: TimeSpeed): void {
    this.speed = speed;
  }

  pause(): void {
    this.speed = 0;
  }

  resume(): void {
    if (this.speed === 0) this.speed = 1;
  }

  /** Real-time driven update, called once per animation frame. */
  update(deltaMs: number): void {
    if (this.speed === 0) return;
    this.accumulatedMs += deltaMs;
    const msPerHour = HOURS_PER_SPEED[this.speed];
    if (this.accumulatedMs < msPerHour) return;
    const hours = this.accumulatedMs / msPerHour;
    this.accumulatedMs = 0;
    this.advanceHours(hours);
  }

  /**
   * Deterministic time advance used by the simulation and by tests.
   *
   * The clock is stepped in sub-day increments so that every daily tick runs
   * with the calendar on the day it actually belongs to. Advancing the whole
   * span first and replaying the days afterwards would make every tick read
   * the same date, and the food bill, aging and visitor schedule would all
   * collapse onto a single day.
   */
  advanceHours(hours: number): void {
    if (hours <= 0) return;
    const cal = this.state.calendar;
    let remaining = hours;
    let guard = 0;

    while (remaining > 1e-9 && guard < 200000) {
      guard += 1;
      const step = Math.min(remaining, 1);
      remaining -= step;

      const { dayBoundary } = advanceHours(cal, step);
      this.state.world.calendar = cal;
      this.state.world.daylight = daylightFactor(cal.hour);

      if (dayBoundary) this.runDailyTick();
    }

    this.store.touch('time:advanced');
  }

  /** Runs one full day boundary of simulation. */
  runDailyTick(): void {
    const day = this.state.calendar.totalDays;
    this.rollWeather();

    // 1. Aging, growth, disease resistance and death by old age.
    tickAging(this.store);

    // 2. Pregnancy and births.
    for (const c of this.store.livingCharacters()) {
      if (c.pregnant) tickPregnancy(this.store, c);
    }

    // 3. Food: 1 unit per living character per day.
    consumeFood(this.store);

    // 4. Buildings produce, construction advances, upkeep applies.
    tickProduction(this.store);
    tickConstruction(this.store);

    // 5. Health systems.
    tickHealing(this.store);
    tickDisease(this.store);

    // 6. Starvation consequences (progressive).
    tickStarvation(this.store);

    // 7. The wider world.
    tickFactions(this.store);
    tickQuests(this.store);

    // 8. Monthly visitor event.
    maybeSpawnVisitor(this.store);

    // 9. Tavern roster rotation.
    if (day - this.state.tavernRosterDay >= TAVERN_ROTATION_DAYS) {
      refreshTavern(this.store);
      this.state.tavernRosterDay = day;
    }

    this.store.emit('time:day', { day });

    // 10. Autosave.
    if (day % AUTOSAVE_DAYS === 0) {
      this.saveManager.save(this.state, 'auto');
    }

    this.onDayComplete?.(day);
  }

  private rollWeather(): void {
    const rng = this.store.rng;
    const season = seasonOf(this.state.calendar.month);
    const roll = rng.next();
    let weather: Weather = 'clear';
    if (roll < 0.12) weather = 'rain';
    else if (roll < 0.16) weather = 'storm';
    else if (roll < 0.2 && season === 'winter') weather = 'snow';
    else if (roll < 0.25) weather = 'fog';

    if (weather !== this.state.weather) {
      this.state.weather = weather;
      this.state.world.weather = weather;
      // Clear sky is the default, so announcing it every time would drown the
      // HUD in toasts. Only notable weather is worth interrupting the player.
      if (weather === 'clear') return;
      const labels: Record<Weather, string> = {
        clear: 'السماء صافية، والظلام يزحف ببطء.',
        rain: 'مطرٌ بارد يضرب أسطح الخيام.',
        storm: 'عاصفةٌ تصرخ فوق الغابة المطيرة.',
        snow: 'ثلجٌ يغطّي أحجار الغرفة والنيران تخفت.',
        fog: 'ضبابٌ كثيف يبتلع الطريق إلى الغابة.',
      };
      this.store.notify(labels[weather], 'info');
    }
  }

  /* ---------------- convenience actions used by the UI ---------------- */

  /** Character ids that can be shown on the world map. */
  visibleCharacterIds(): Id[] {
    return this.store.livingCharacters().map((c) => c.id);
  }

  save(slot: number | 'auto' = 1): boolean {
    return this.saveManager.save(this.state, slot);
  }

  load(slot: number | 'auto'): GameState | null {
    return this.saveManager.load(slot);
  }

  listSaves() {
    return this.saveManager.list();
  }
}

/**
 * Creates the faction and quest tables for a brand-new world.
 * Called once during new-game setup.
 */
export function bootstrapWorldEntities(store: GameStore): void {
  store.state.factions = createFactions(store);
  store.state.quests = createQuests(store);
  // The tavern opens with a roster already in place, so the player has
  // someone to hire on day one instead of waiting for the first rotation.
  refreshTavern(store);
  store.state.tavernRosterDay = store.state.calendar.totalDays;
}
