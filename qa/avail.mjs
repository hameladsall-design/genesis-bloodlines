/** Probe: what is actually available to the player on day one? */
import { createNewGame } from '../src/game/simulation/systems/newGame';
import { GameStore } from '../src/game/simulation/store';
import { bootstrapWorldEntities } from '../src/game/simulation/engine';
import { encountersAvailable } from '../src/game/content/enemies';
import { tavernOffers, refreshTavern } from '../src/game/simulation/systems/tavern';
import { gatherFromNode } from '../src/game/simulation/systems/economy';

const config = {
  founderName: 'باسم', familyName: 'صقر', dynastyName: 'القرون', emblem: '♛',
  primaryColor: '#7a1f2b', secondaryColor: '#c8a24a', seed: 'avail-001',
  worldSize: 'medium', difficulty: 'normal', enemyDensity: 'normal',
  resourceAbundance: 'normal', diseaseFrequency: 'normal',
  disasterFrequency: 'normal', timeSpeed: 1,
};

const state = createNewGame(config);
const store = new GameStore(state, config.seed);
bootstrapWorldEntities(store);

console.log('unlockedZones:', state.world.unlockedZones);
console.log('base level:', state.base.level, 'capacity:', state.base.capacity);
console.log('encountersAvailable:', encountersAvailable(state).length);
console.log('  ->', encountersAvailable(state).map((e) => `${e.id} stage${e.stage} minLv${e.minLevel} minBase${e.minBaseLevel ?? 1} zone=${e.zone ?? '-'}`).join('\n     '));

console.log('\ntavern offers at start:', tavernOffers(store).length);
refreshTavern(store);
console.log('tavern offers after refresh:', tavernOffers(store).length);

// Gathering.
const node = state.world.resourceNodes.find((n) => n.kind === 'wood' && n.amount > 0);
const worker = store.livingCharacters()[0];
console.log('\nnode:', node?.id, 'amount', node?.amount, 'worker job', worker.job);
const g = gatherFromNode(store, node.id, worker.id);
console.log('gather result:', JSON.stringify(g));
