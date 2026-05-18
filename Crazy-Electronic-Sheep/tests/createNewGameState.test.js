const assert = require('node:assert/strict');
const test = require('node:test');
const { GAME_CONFIG } = require('../temp/node-tests/assets/scripts/config/gameConfig.js');
const {
  createNewGameState,
} = require('../temp/node-tests/assets/scripts/domain/createNewGameState.js');
const {
  buySheepOnCurrentMap,
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

test('在第一图购买默认可买羊时，会扣资源并把新羊放到下一个合法出生点', () => {
  const now = 1_717_171_717_000;
  const gameState = createNewGameState(GAME_CONFIG, now);
  const purchaseCost = GAME_CONFIG.sheepDefinitions['001'].purchaseIdleEnergyCost;
  gameState.currencies.idleEnergy = purchaseCost + 5;

  const purchaseResult = buySheepOnCurrentMap(
    gameState,
    {
      maps: GAME_CONFIG.maps,
      sheepDefinitions: GAME_CONFIG.sheepDefinitions,
    },
    {
      sheepId: '001',
    },
    now + 1_000,
  );

  assert.equal(purchaseResult.kind, 'success');
  assert.notStrictEqual(purchaseResult.gameState, gameState);
  assert.equal(purchaseResult.gameState.currencies.idleEnergy, 5);
  assert.equal(getMapSheepInstances(purchaseResult.gameState, 'map_01').length, 2);
  assert.equal(getMapSheepInstances(purchaseResult.gameState, 'map_02').length, 0);

  const purchasedSheep = getMapSheepInstances(purchaseResult.gameState, 'map_01').find(
    (sheepInstance) => sheepInstance.source === 'purchase',
  );
  assert.ok(purchasedSheep);
  assert.deepEqual(purchasedSheep.position, GAME_CONFIG.maps.map_01.spawnPoints[1]);
});

test('第一图达到容量上限时，购买失败且不会扣资源或改写状态', () => {
  const now = 1_717_171_717_000;
  const fullCapacityConfig = {
    ...GAME_CONFIG,
    maps: {
      ...GAME_CONFIG.maps,
      map_01: {
        ...GAME_CONFIG.maps.map_01,
        maxSheepCapacity: 1,
      },
    },
  };
  const gameState = createNewGameState(fullCapacityConfig, now);
  gameState.currencies.idleEnergy = 999;
  const beforeSnapshot = JSON.stringify(gameState);

  const purchaseResult = buySheepOnCurrentMap(
    gameState,
    {
      maps: fullCapacityConfig.maps,
      sheepDefinitions: fullCapacityConfig.sheepDefinitions,
    },
    {
      sheepId: '001',
    },
    now + 1_000,
  );

  assert.equal(purchaseResult.kind, 'failure');
  assert.equal(purchaseResult.reason, 'map_capacity_full');
  assert.strictEqual(purchaseResult.gameState, gameState);
  assert.equal(JSON.stringify(gameState), beforeSnapshot);
});

test('第一图仍有容量但没有合法出生点时，购买失败且不会产生副作用', () => {
  const now = 1_717_171_717_000;
  const noSpawnConfig = {
    ...GAME_CONFIG,
    maps: {
      ...GAME_CONFIG.maps,
      map_01: {
        ...GAME_CONFIG.maps.map_01,
        maxSheepCapacity: 3,
        spawnPoints: [GAME_CONFIG.maps.map_01.spawnPoints[0]],
      },
    },
  };
  const gameState = createNewGameState(noSpawnConfig, now);
  gameState.currencies.idleEnergy = 999;
  const beforeSnapshot = JSON.stringify(gameState);

  const purchaseResult = buySheepOnCurrentMap(
    gameState,
    {
      maps: noSpawnConfig.maps,
      sheepDefinitions: noSpawnConfig.sheepDefinitions,
    },
    {
      sheepId: '001',
    },
    now + 1_000,
  );

  assert.equal(purchaseResult.kind, 'failure');
  assert.equal(purchaseResult.reason, 'no_legal_spawn_position');
  assert.strictEqual(purchaseResult.gameState, gameState);
  assert.equal(JSON.stringify(gameState), beforeSnapshot);
});

test('第一图资源不足时，购买失败且不会扣资源或改写地图实例', () => {
  const now = 1_717_171_717_000;
  const gameState = createNewGameState(GAME_CONFIG, now);
  const beforeSnapshot = JSON.stringify(gameState);

  const purchaseResult = buySheepOnCurrentMap(
    gameState,
    {
      maps: GAME_CONFIG.maps,
      sheepDefinitions: GAME_CONFIG.sheepDefinitions,
    },
    {
      sheepId: '001',
    },
    now + 1_000,
  );

  assert.equal(purchaseResult.kind, 'failure');
  assert.equal(purchaseResult.reason, 'insufficient_idle_energy');
  assert.strictEqual(purchaseResult.gameState, gameState);
  assert.equal(JSON.stringify(gameState), beforeSnapshot);
});
