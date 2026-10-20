import assert from 'node:assert/strict';

import { it } from 'vitest';

import { loadEngineBundle } from './helpers/engineBundle.mjs';

const engine = await loadEngineBundle(
  `export * from './src/engine/spellSlotTable.ts';`,
);

/**
 * Запись класса листа.
 *
 * @param {string} classKey - ключ класса
 * @param {number} level - уровень в классе
 * @param {string} casterType - тип заклинателя
 * @returns {object} запись класса
 */
function entry(classKey, level, casterType) {
  return { classKey, level, casterType };
}

it('паладин 2014 на 1 уровне без ячеек', () => {
  assert.deepEqual(
    engine.getSpellSlots('half', 1),
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
  );
});

it('паладин 2014 получает ячейки со 2 уровня', () => {
  assert.deepEqual(
    engine.getSpellSlots('half', 2),
    [2, 0, 0, 0, 0, 0, 0, 0, 0],
  );

  assert.deepEqual(
    engine.getSpellSlots('half', 5),
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
  );

  assert.deepEqual(
    engine.getSpellSlots('half', 20),
    [4, 3, 3, 3, 2, 0, 0, 0, 0],
  );
});

it('в мультиклассе половинный заклинатель округляет вниз', () => {
  const classes = [entry('paladin', 5, 'half'), entry('ranger', 3, 'half')];

  assert.equal(
    engine.getMulticlassCasterLevel(
      classes,
      engine.buildCasterTypeMap(classes),
    ),
    3,
  );
});

it('паладин 1 уровня не добавляет ячеек волшебнику', () => {
  const classes = [entry('wizard', 3, 'full'), entry('paladin', 1, 'half')];

  assert.deepEqual(
    engine.computeSpellSlots(classes, engine.buildCasterTypeMap(classes)),
    [4, 2, 0, 0, 0, 0, 0, 0, 0],
  );
});
