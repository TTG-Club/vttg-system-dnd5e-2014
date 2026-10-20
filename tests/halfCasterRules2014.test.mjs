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

const prepared = await loadEngineBundle(
  `export * from './src/engine/preparedSpells.ts';`,
);

/** Класс без колонки подготовки — как жрец, друид, волшебник и паладин 2014. */
const noPreparedColumn = () => ({ tableColumns: [], levelTable: [] });

it('жрец 2014 готовит модификатор Мудрости плюс уровень', () => {
  assert.equal(
    prepared.getClassPreparedValue(
      [{ level: 3, casterType: 'full', spellcastingAbility: 'wisdom' }],
      noPreparedColumn,
      'spells',
      { wisdom: 3 },
    ),
    6,
  );
});

it('паладин 2014 готовит Харизму плюс половину уровня и только со 2 уровня', () => {
  const paladin = (level) => [
    { level, casterType: 'half', spellcastingAbility: 'charisma' },
  ];

  assert.equal(
    prepared.getClassPreparedValue(paladin(1), noPreparedColumn, 'spells', {
      charisma: 3,
    }),
    null,
  );

  assert.equal(
    prepared.getClassPreparedValue(paladin(5), noPreparedColumn, 'spells', {
      charisma: 3,
    }),
    5,
  );
});

it('формула подготовки не опускается ниже одного', () => {
  assert.equal(
    prepared.getClassPreparedValue(
      [{ level: 1, casterType: 'full', spellcastingAbility: 'intelligence' }],
      noPreparedColumn,
      'spells',
      { intelligence: -1 },
    ),
    1,
  );
});

it('следопыт 2014 берёт предел из колонки «Известные заклинания»', () => {
  assert.equal(
    prepared.getClassPreparedValue(
      [{ level: 3, casterType: 'half', spellcastingAbility: 'wisdom' }],
      () => ({
        tableColumns: [{ key: 'spellsKnown', label: 'Известные заклинания' }],
        levelTable: [
          { level: 2, spellsKnown: '2' },
          { level: 3, spellsKnown: '3' },
        ],
      }),
      'spells',
      { wisdom: 3 },
    ),
    3,
  );
});
