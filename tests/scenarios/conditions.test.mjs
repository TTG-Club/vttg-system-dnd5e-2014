import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import {
  createActor,
  createCreature,
  createEffect,
  engine,
} from './_fixtures.mjs';

/**
 * Каталог: состояния D&D 5e 2024 (`docs/EFFECT_SCENARIOS.md`, раздел «Состояния»).
 * Состояние накладывается тем же путём, что атака или заклинание.
 */

/**
 * Статы сущности с наложенными состояниями.
 *
 * @param {object} entity - сущность
 * @param {string[]} conditionKeys - состояния
 * @returns {object} статы
 */
function statsWithConditions(entity, conditionKeys) {
  const effects = conditionKeys.map((conditionKey) =>
    engine.buildConditionActiveEffect(conditionKey),
  );

  entity.activeEffects = engine.applyEffectsToEntity(
    entity,
    effects,
    'condition',
  );

  return engine.resolveActorStats(entity);
}

/**
 * Режим рукопашной и дальнобойной атаки по цели.
 *
 * @param {Set<string>} attackerFlags - флаги атакующего
 * @param {Set<string>} targetFlags - флаги цели
 * @returns {{ melee: string, ranged: string }} режимы
 */
function attackModes(attackerFlags, targetFlags) {
  return {
    melee: engine.resolveAttackRollMode({
      attackerFlags,
      attackType: 'melee',
      targetFlags,
    }),
    ranged: engine.resolveAttackRollMode({
      attackerFlags,
      attackType: 'ranged',
      targetFlags,
    }),
  };
}

/** Флаги без состояний */
const NO_FLAGS = new Set();

describe('каталог: состояния', () => {
  it('[CD01] Лежащий ничком: рукопашные по нему с преимуществом, дальнобойные с помехой, сам — с помехой', () => {
    const prone = statsWithConditions(createCreature(), ['prone']).activeFlags;

    assert.deepEqual(attackModes(NO_FLAGS, prone), {
      melee: 'advantage',
      ranged: 'disadvantage',
    });

    assert.deepEqual(attackModes(prone, NO_FLAGS), {
      melee: 'disadvantage',
      ranged: 'disadvantage',
    });
  });

  it('[CD02] Схваченный: скорость 0', () => {
    const stats = statsWithConditions(createActor(), ['grappled']);

    assert.equal(engine.resolveTotalMovementSpeed(stats), 0);
  });

  it('[CD03] Парализованный: недееспособен, автопровал Силы и Ловкости, атаки по нему с преимуществом', () => {
    const flags = statsWithConditions(createActor(), ['paralyzed']).activeFlags;

    assert.ok(flags.has('incapacitated'));
    assert.ok(flags.has('save.autoFail.strength'));
    assert.ok(flags.has('save.autoFail.dexterity'));
    assert.equal(attackModes(NO_FLAGS, flags).melee, 'advantage');
  });

  it.todo(
    '[CD03b] Парализованный: попадание в пределах 5 фт — всегда крит — пробел (нет дистанции атаки в движке)',
  );

  it('[CD04] Невидимый против Ослеплённого: невидимый бьёт с преимуществом, слепой по невидимому — с помехой', () => {
    const invisible = statsWithConditions(createActor(), [
      'invisible',
    ]).activeFlags;

    const blinded = statsWithConditions(createCreature(), [
      'blinded',
    ]).activeFlags;

    assert.equal(attackModes(invisible, blinded).melee, 'advantage');
    assert.equal(attackModes(blinded, invisible).melee, 'disadvantage');

    assert.equal(
      engine.resolveInitiativeRollMode(invisible),
      'normal',
      'преимущество на инициативу невидимому дал только 2024',
    );
  });

  it('[CD05] Истощение 3 (PHB 2014): помехи на проверки, атаки и спасброски, скорость вдвое', () => {
    const hero = createActor();
    const baseline = engine.resolveActorStats(hero);

    hero.activeEffects = engine.withExhaustionLevel([], 3);

    const stats = engine.resolveActorStats(hero);

    // Числа не меняются: в 2014 истощение даёт помехи, а не штрафы
    assert.equal(stats.saves.wisdom, baseline.saves.wisdom);
    assert.equal(stats.attackBonuses.melee, baseline.attackBonuses.melee);
    assert.equal(stats.initiative, baseline.initiative);
    assert.equal(stats.hitPointsMax, baseline.hitPointsMax);

    assert.equal(stats.movement.walk, Math.floor(baseline.movement.walk / 2));

    assert.equal(
      attackModes(stats.activeFlags, NO_FLAGS).melee,
      'disadvantage',
    );

    assert.ok(stats.activeFlags.has('save.disadvantage'));

    assert.equal(
      engine.resolveAbilityCheckRollMode({
        flags: stats.activeFlags,
        ability: 'wisdom',
        skill: 'perception',
      }),
      'disadvantage',
    );

    hero.activeEffects = engine.withExhaustionLevel(hero.activeEffects, 0);
    assert.deepEqual(hero.activeEffects, []);
  });

  it('[CD05b] Истощение 4–5 (PHB 2014): максимум хитов вдвое, затем скорость 0', () => {
    const hero = createActor();
    const baseline = engine.resolveActorStats(hero);

    hero.activeEffects = engine.withExhaustionLevel([], 4);

    const fourth = engine.resolveActorStats(hero);

    assert.equal(fourth.hitPointsMax, baseline.hitPointsMax / 2);
    assert.equal(fourth.movement.walk, Math.floor(baseline.movement.walk / 2));

    hero.activeEffects = engine.withExhaustionLevel(hero.activeEffects, 5);

    const fifth = engine.resolveActorStats(hero);

    assert.equal(fifth.movement.walk, 0);
    assert.equal(fifth.hitPointsMax, baseline.hitPointsMax / 2);
  });

  it('[CD06] Окаменевший: сопротивление всему урону и иммунитет к Отравлению', () => {
    const creature = createCreature();
    const stats = statsWithConditions(creature, ['petrified']);

    assert.ok(stats.damageDefenses.resistances.has('fire'));
    assert.ok(stats.activeFlags.has('incapacitated'));

    const poisoned = engine.buildConditionActiveEffect('poisoned');

    assert.equal(
      engine
        .applyEffectsToEntity(creature, [poisoned], 'condition')
        .some((effect) => effect.conditionKey === 'poisoned'),
      false,
    );
  });

  it('[CD07] Отравленный: помеха на атаки и проверки характеристик', () => {
    const flags = statsWithConditions(createActor(), ['poisoned']).activeFlags;

    assert.equal(attackModes(flags, NO_FLAGS).melee, 'disadvantage');

    assert.equal(
      engine.resolveAbilityCheckRollMode({
        flags,
        ability: 'wisdom',
        skill: 'perception',
      }),
      'disadvantage',
    );
  });

  it('[CD08] Повторное наложение того же состояния заменяет прежнее, разные складываются', () => {
    const hero = createActor();

    statsWithConditions(hero, ['poisoned']);
    statsWithConditions(hero, ['poisoned']);
    assert.equal(hero.activeEffects.length, 1);

    statsWithConditions(hero, ['prone']);
    assert.equal(hero.activeEffects.length, 2);
  });

  it('[CD09] Недееспособный: флаг без помехи на инициативу', () => {
    const flags = statsWithConditions(createActor(), [
      'incapacitated',
    ]).activeFlags;

    assert.ok(flags.has('incapacitated'));

    assert.equal(
      engine.resolveInitiativeRollMode(flags),
      'normal',
      'помеху на инициативу недееспособному дал только 2024',
    );
  });

  it('[CD13] Ошеломлённый: недееспособен и не может перемещаться', () => {
    const stats = statsWithConditions(createActor(), ['stunned']);

    assert.ok(stats.activeFlags.has('incapacitated'));
    assert.equal(engine.resolveTotalMovementSpeed(stats), 0);
  });

  it('[CD10] Преимущество и помеха гасят друг друга: отравленный атакует лежащего рукопашной', () => {
    const poisoned = statsWithConditions(createActor(), [
      'poisoned',
    ]).activeFlags;

    const prone = statsWithConditions(createCreature(), ['prone']).activeFlags;

    assert.equal(attackModes(poisoned, prone).melee, 'normal');
  });

  it.todo(
    '[CD11] Бессознательный: падает ничком и роняет предметы — пробел (побочные действия состояния)',
  );

  it('[CD12] Истощение от срабатывания растёт на степень, а не заменяет прежнюю', () => {
    const drain = createEffect('Изнурение', {
      effectTarget: 'target',
      triggers: [
        {
          id: 'trigger_exhaust',
          event: 'turnEnd',
          actions: [{ type: 'applyCondition', conditionKey: 'exhaustion' }],
        },
      ],
    });

    const target = createCreature({ activeEffects: [drain] });

    target.activeEffects = engine.withExhaustionLevel(target.activeEffects, 2);

    engine.processTurnEffects(target, 'endOfTurn');

    assert.equal(engine.getEntityExhaustionLevel(target.activeEffects), 3);

    engine.processTurnEffects(target, 'endOfTurn');

    assert.equal(
      engine.getEntityExhaustionLevel(target.activeEffects),
      4,
      'каждое наложение — ещё одна степень',
    );
  });
});
