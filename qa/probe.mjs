/** Headless simulation probe: what actually happens over the first year? */
import { createNewGame } from '../src/game/simulation/systems/newGame';
import { GameStore } from '../src/game/simulation/store';
import { GameEngine } from '../src/game/simulation/engine';
import { bootstrapWorldEntities } from '../src/game/simulation/engine';

const config = {
  founderName: 'باسم',
  familyName: 'صقر',
  dynastyName: 'القرون',
  emblem: '♛',
  primaryColor: '#7a1f2b',
  secondaryColor: '#c8a24a',
  seed: 'probe-seed',
  worldSize: 'medium',
  difficulty: 'normal',
  enemyDensity: 'normal',
  resourceAbundance: 'normal',
  diseaseFrequency: 'normal',
  disasterFrequency: 'normal',
  timeSpeed: 1,
};

const state = createNewGame(config);
const store = new GameStore(state, config.seed);
bootstrapWorldEntities(store);
const engine = new GameEngine(store);

const founder = store.allCharacters()[0];
console.log('founder:', founder.firstName, founder.familyName, 'race', founder.race, 'age', founder.age, 'hp', founder.health, '/', founder.stats.hp);
console.log('birthday bornDay', founder.bornDay, 'lifespan basis', founder.age);

for (let day = 1; day <= 60; day++) {
  engine.advanceHours(24);
  const f = store.getCharacter(founder.id);
  if (day % 5 === 0 || !f.alive) {
    console.log(
      `day ${String(day).padStart(2)} | alive=${f.alive} hp=${f.health.toFixed(0)} cond=${f.status.condition}` +
      ` hunger=${f.status.hunger.toFixed(0)} disease=${f.status.disease ? f.status.disease.nameEn : '-'} age=${f.age.toFixed(2)}` +
      ` | food=${store.getResource('food')} living=${store.livingCount()}${f.alive ? '' : ` CAUSE=${f.causeOfDeath}`}`,
    );
  }
  if (!f.alive) break;
}

console.log('\nchronicle tail:');
for (const c of state.chronicle.slice(-8)) console.log('  ', c.day, c.text);
console.log('\nnotifications tail:');
for (const n of state.notifications.slice(-8)) console.log('  ', n.kind, n.text);
