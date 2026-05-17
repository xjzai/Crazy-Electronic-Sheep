const assert = require('node:assert/strict');
const test = require('node:test');
const { GAME_CONFIG } = require('../temp/node-tests/assets/scripts/config/gameConfig.js');
const {
  createNewGameState,
} = require('../temp/node-tests/assets/scripts/domain/createNewGameState.js');
const {
  countUnlockedCollectionEntries,
  getMapSheepInstances,
} = require('../temp/node-tests/assets/scripts/domain/gameStateSchema.js');

test('新档会进入 map_01，并同步赠送羊、最高解锁羊、已解锁列表和图鉴状态', () => {
  const now = 1_717_171_717_000;
  const gameState = createNewGameState(GAME_CONFIG, now);

  assert.equal(gameState.currentMapId, 'map_01');
  assert.equal(gameState.highestUnlockedMapId, 'map_01');
  assert.equal(gameState.highestUnlockedSheepId, '001');
  assert.deepEqual(gameState.unlockedSheepIds, ['001']);
  assert.equal(gameState.collection['001'].isUnlocked, true);
  assert.equal(gameState.collection['001'].unlockedAt, now);
  assert.equal(countUnlockedCollectionEntries(gameState), 1);
  assert.equal(gameState.maps.map_01.isUnlocked, true);
  assert.equal(gameState.maps.map_02.isUnlocked, false);

  const mapOneSheep = getMapSheepInstances(gameState, 'map_01');
  assert.equal(mapOneSheep.length, 1);
  assert.equal(mapOneSheep[0].sheepId, '001');
  assert.equal(mapOneSheep[0].mapId, 'map_01');
});
