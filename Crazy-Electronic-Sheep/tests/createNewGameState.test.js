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
const {
  createInitialSheepRoamingState,
  createSheepVisualStyle,
  getSheepSpriteScaleX,
  stepSheepRoamingState,
} = require('../temp/node-tests/assets/scripts/domain/sheepRoamingService.js');

function createFixedRandom(values) {
  let index = 0;

  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}

function assertPositionInsideBounds(position, bounds) {
  assert.ok(position.x >= bounds.minX, `x ${position.x} should be >= ${bounds.minX}`);
  assert.ok(position.x <= bounds.maxX, `x ${position.x} should be <= ${bounds.maxX}`);
  assert.ok(position.y >= bounds.minY, `y ${position.y} should be >= ${bounds.minY}`);
  assert.ok(position.y <= bounds.maxY, `y ${position.y} should be <= ${bounds.maxY}`);
}

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

test('第一图羊漫游状态会先停顿，再选择边界内连续目标并按方向翻转', () => {
  const gameState = createNewGameState(GAME_CONFIG, 1_717_171_717_000);
  const sheep = getMapSheepInstances(gameState, 'map_01')[0];
  const random = createFixedRandom([0, 0.9, 0.5]);

  const initialRoamingState = createInitialSheepRoamingState(
    sheep,
    GAME_CONFIG.roaming,
    random,
  );

  assert.equal(initialRoamingState.phase, 'idle');
  assert.equal(initialRoamingState.facing, 'right');
  assertPositionInsideBounds(
    initialRoamingState.position,
    GAME_CONFIG.roaming.mapBounds.map_01,
  );
  assert.notDeepEqual(initialRoamingState.position, sheep.position);
  assert.deepEqual(
    createInitialSheepRoamingState(
      sheep,
      GAME_CONFIG.roaming,
      createFixedRandom([0, 0.9, 0.5]),
    ).position,
    initialRoamingState.position,
  );
  assert.deepEqual(initialRoamingState.position, {
    x: GAME_CONFIG.roaming.mapBounds.map_01.minX,
    y: Math.round(
      GAME_CONFIG.roaming.mapBounds.map_01.minY +
        0.9 *
          (GAME_CONFIG.roaming.mapBounds.map_01.maxY -
            GAME_CONFIG.roaming.mapBounds.map_01.minY),
    ),
  });

  const waitingState = stepSheepRoamingState(
    initialRoamingState,
    GAME_CONFIG.roaming.mapBounds.map_01,
    GAME_CONFIG.roaming,
    GAME_CONFIG.roaming.minIdleSeconds / 2,
    random,
  );

  assert.equal(waitingState.phase, 'idle');
  assert.ok(waitingState.remainingSeconds > 0);

  const walkingState = stepSheepRoamingState(
    waitingState,
    GAME_CONFIG.roaming.mapBounds.map_01,
    GAME_CONFIG.roaming,
    GAME_CONFIG.roaming.maxIdleSeconds,
    random,
  );

  assert.equal(walkingState.phase, 'walking');
  assert.equal(walkingState.facing, 'right');
  assert.ok(walkingState.targetPosition);
  assert.ok(walkingState.targetPosition.x <= GAME_CONFIG.roaming.mapBounds.map_01.maxX);
  assert.ok(walkingState.targetPosition.x >= GAME_CONFIG.roaming.mapBounds.map_01.minX);
  assert.ok(walkingState.targetPosition.y <= GAME_CONFIG.roaming.mapBounds.map_01.maxY);
  assert.ok(walkingState.targetPosition.y >= GAME_CONFIG.roaming.mapBounds.map_01.minY);
  assert.notDeepEqual(walkingState.targetPosition, GAME_CONFIG.maps.map_01.spawnPoints[0]);
});

test('第一图羊行走会按速度推进，到达目标后回到停顿状态', () => {
  const random = createFixedRandom([0.25]);
  const walkingState = {
    phase: 'walking',
    position: { x: 100, y: 0 },
    targetPosition: { x: 0, y: 0 },
    facing: 'left',
    remainingSeconds: 0,
    speedUnitsPerSecond: 50,
  };

  const movedState = stepSheepRoamingState(
    walkingState,
    GAME_CONFIG.roaming.mapBounds.map_01,
    GAME_CONFIG.roaming,
    1,
    random,
  );

  assert.equal(movedState.phase, 'walking');
  assert.equal(movedState.facing, 'left');
  assert.deepEqual(movedState.position, { x: 50, y: 0 });

  const arrivedState = stepSheepRoamingState(
    movedState,
    GAME_CONFIG.roaming.mapBounds.map_01,
    GAME_CONFIG.roaming,
    2,
    random,
  );

  assert.equal(arrivedState.phase, 'idle');
  assert.deepEqual(arrivedState.position, { x: 0, y: 0 });
  assert.equal(arrivedState.targetPosition, null);
  assert.ok(arrivedState.remainingSeconds >= GAME_CONFIG.roaming.minIdleSeconds);
});

test('羊等级视觉样式会随编号稳定区分', () => {
  const firstLevelStyle = createSheepVisualStyle('001');
  const middleLevelStyle = createSheepVisualStyle('010');
  const lateLevelStyle = createSheepVisualStyle('020');

  assert.equal(Object.hasOwn(firstLevelStyle, 'badgeText'), false);
  assert.ok(middleLevelStyle.displayScale > firstLevelStyle.displayScale);
  assert.ok(lateLevelStyle.displayScale > middleLevelStyle.displayScale);
  assert.notDeepEqual(middleLevelStyle.tint, firstLevelStyle.tint);
  assert.notDeepEqual(lateLevelStyle.tint, middleLevelStyle.tint);
  assert.deepEqual(createSheepVisualStyle('010'), middleLevelStyle);
});

test('第一图羊贴图朝向会按 sheep_001 原始面向左的素材反向映射', () => {
  assert.equal(getSheepSpriteScaleX('right'), -1);
  assert.equal(getSheepSpriteScaleX('left'), 1);
});

test('第一图出生点和漫游边界会留在栅栏内圈', () => {
  const bounds = GAME_CONFIG.roaming.mapBounds.map_01;

  assert.deepEqual(bounds, {
    minX: -220,
    maxX: 220,
    minY: -300,
    maxY: 280,
  });
  for (const spawnPoint of GAME_CONFIG.maps.map_01.spawnPoints) {
    assertPositionInsideBounds(spawnPoint, bounds);
  }
});

test('旧存档中的第一图越界羊会在创建漫游表现态时回到栅栏内圈', () => {
  const bounds = GAME_CONFIG.roaming.mapBounds.map_01;
  const roamingState = createInitialSheepRoamingState(
    {
      instanceId: 'legacy-map_01-001-01',
      sheepId: '001',
      mapId: 'map_01',
      bornAt: 1_717_171_717_000,
      source: 'new_game_gift',
      position: { x: 999, y: -999 },
    },
    GAME_CONFIG.roaming,
    createFixedRandom([0]),
  );

  assertPositionInsideBounds(roamingState.position, bounds);
});

test('第一图重新进游戏时会重新随机打散初始表现位置', () => {
  const bounds = GAME_CONFIG.roaming.mapBounds.map_01;
  const baseSheep = {
    instanceId: 'purchase-map_01-001-01',
    sheepId: '001',
    mapId: 'map_01',
    bornAt: 1_717_171_717_000,
    source: 'purchase',
    position: GAME_CONFIG.maps.map_01.spawnPoints[0],
  };
  const firstEntryState = createInitialSheepRoamingState(
    baseSheep,
    GAME_CONFIG.roaming,
    createFixedRandom([0.1, 0.8, 0]),
  );
  const nextEntryState = createInitialSheepRoamingState(
    baseSheep,
    GAME_CONFIG.roaming,
    createFixedRandom([0.8, 0.2, 0]),
  );
  const repeatableState = createInitialSheepRoamingState(
    baseSheep,
    GAME_CONFIG.roaming,
    createFixedRandom([0.1, 0.8, 0]),
  );

  assertPositionInsideBounds(firstEntryState.position, bounds);
  assertPositionInsideBounds(nextEntryState.position, bounds);
  assert.notDeepEqual(firstEntryState.position, baseSheep.position);
  assert.notDeepEqual(firstEntryState.position, nextEntryState.position);
  assert.deepEqual(firstEntryState.position, repeatableState.position);
});

test('第一图初始随机位置会覆盖完整可移动边界而不是出生点附近半径', () => {
  const bounds = GAME_CONFIG.roaming.mapBounds.map_01;
  const sheep = {
    instanceId: 'purchase-map_01-001-edge',
    sheepId: '001',
    mapId: 'map_01',
    bornAt: 1_717_171_717_000,
    source: 'purchase',
    position: GAME_CONFIG.maps.map_01.spawnPoints[0],
  };

  const minCornerState = createInitialSheepRoamingState(
    sheep,
    GAME_CONFIG.roaming,
    createFixedRandom([0, 0, 0]),
  );
  const maxCornerState = createInitialSheepRoamingState(
    sheep,
    GAME_CONFIG.roaming,
    createFixedRandom([1, 1, 0]),
  );

  assert.deepEqual(minCornerState.position, {
    x: bounds.minX,
    y: bounds.minY,
  });
  assert.deepEqual(maxCornerState.position, {
    x: bounds.maxX,
    y: bounds.maxY,
  });
});
