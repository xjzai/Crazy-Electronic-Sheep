const assert = require('node:assert/strict');
const test = require('node:test');
const {
  bootGameState,
} = require('../temp/node-tests/assets/scripts/boot/bootCoordinator.js');
const {
  createNewGameState,
} = require('../temp/node-tests/assets/scripts/domain/createNewGameState.js');

test('空档启动时会新建存档并立即写回', () => {
  let persistedText = '';

  const bootResult = bootGameState({
    readSerializedSave: () => null,
    writeSerializedSave: (gameState) => {
      persistedText = JSON.stringify(gameState);
      return true;
    },
    now: () => 1_717_171_717_000,
  });

  assert.equal(bootResult.source, 'new-save-missing');
  assert.equal(bootResult.didPersist, true);
  assert.ok(persistedText.includes('"highestUnlockedSheepId":"001"'));
});

test('有效旧档启动时直接复用，不重复覆盖存档', () => {
  const existingState = createNewGameState(undefined, 1_717_171_717_000);
  let writeCount = 0;

  const bootResult = bootGameState({
    readSerializedSave: () => JSON.stringify(existingState),
    writeSerializedSave: () => {
      writeCount += 1;
      return true;
    },
  });

  assert.equal(bootResult.source, 'existing-save');
  assert.equal(bootResult.didPersist, false);
  assert.equal(writeCount, 0);
  assert.deepEqual(bootResult.gameState, existingState);
});

test('坏档启动时会重建新档并同步写回', () => {
  let writeCount = 0;

  const bootResult = bootGameState({
    readSerializedSave: () => '{"broken":true}',
    writeSerializedSave: () => {
      writeCount += 1;
      return true;
    },
    now: () => 1_717_171_717_123,
  });

  assert.equal(bootResult.source, 'new-save-recreated');
  assert.equal(bootResult.didPersist, true);
  assert.equal(writeCount, 1);
  assert.equal(bootResult.gameState.highestUnlockedSheepId, '001');
  assert.equal(bootResult.gameState.maps.map_02.isUnlocked, false);
});
