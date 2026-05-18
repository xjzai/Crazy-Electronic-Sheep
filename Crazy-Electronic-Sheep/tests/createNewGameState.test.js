const assert = require('node:assert/strict');
const test = require('node:test');
const { GAME_CONFIG } = require('../temp/node-tests/assets/scripts/config/gameConfig.js');
const {
  createNewGameState,
} = require('../temp/node-tests/assets/scripts/domain/createNewGameState.js');
const {
  createCoreHudSnapshot,
  countUnlockedCollectionEntries,
  getGlobalIdleEnergyPerSecond,
  getMapSheepInstances,
  settleIdleProduction,
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

test('新档赠送的 001 会贡献 1 点全局秒产，核心 HUD 快照能读出关键指标', () => {
  const gameState = createNewGameState(GAME_CONFIG, 1_717_171_717_000);

  assert.equal(getGlobalIdleEnergyPerSecond(gameState, GAME_CONFIG.sheepDefinitions), 1);
  assert.deepEqual(
    createCoreHudSnapshot(gameState, GAME_CONFIG.sheepDefinitions),
    {
      idleEnergy: 0,
      globalIdleEnergyPerSecond: 1,
      highestUnlockedSheepId: '001',
    },
  );
});

test('自动产出按整秒结算时，会按全局总秒产累加摸鱼能量并更新时间', () => {
  const now = 1_717_171_717_000;
  const gameState = createNewGameState(GAME_CONFIG, now);

  gameState.highestUnlockedSheepId = '002';
  gameState.unlockedSheepIds = ['001', '002'];
  gameState.collection['002'].isUnlocked = true;
  gameState.collection['002'].unlockedAt = now;
  gameState.sheepInstances['gift-map_01-002-01'] = {
    instanceId: 'gift-map_01-002-01',
    sheepId: '002',
    mapId: 'map_01',
    bornAt: now,
    source: 'new_game_gift',
  };
  gameState.maps.map_01.sheepInstanceIds.push('gift-map_01-002-01');

  const settledState = settleIdleProduction(
    gameState,
    GAME_CONFIG.sheepDefinitions,
    3,
    now + 3_000,
  );

  assert.equal(getGlobalIdleEnergyPerSecond(gameState, GAME_CONFIG.sheepDefinitions), 3);
  assert.equal(settledState.currencies.idleEnergy, 9);
  assert.equal(settledState.updatedAt, now + 3_000);
  assert.equal(gameState.currencies.idleEnergy, 0);
});
