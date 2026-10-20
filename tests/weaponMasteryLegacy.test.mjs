import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { createActor, engine } from './scenarios/_fixtures.mjs';

/**
 * Мастерства оружия (weapon mastery) в 2014 нет. Записи, сохранённые системой
 * 2024 или до удаления мастерства, ещё несут его поля: выборы «оружие с
 * приёмом» и «оружейный приём», дары `weaponMasteries`/`masteryProperties`,
 * требование черты «Оружейные приёмы». Движок их терпит — ничего не падает —
 * и игнорирует: ничего не спрашивает, не выдаёт и не показывает.
 */

/** Черта 2024 со всеми полями мастерства сразу. */
const LEGACY_FEAT_DATA = {
  type: 'feat',
  weaponProficiencies: ['longsword'],
  weaponMasteries: ['longsword'],
  masteryProperties: ['topple'],
  prerequisite: { classFeatures: ['weaponMastery'] },
  choices: [
    { key: 'mastery', type: 'weaponMastery', count: 3 },
    { key: 'property', type: 'masteryProperty', count: 1 },
    { key: 'mixed', type: 'weapon', types: ['weapon', 'weaponMastery'] },
    { key: 'skill', type: 'skill', count: 1 },
  ],
};

describe('старые записи с мастерством оружия', () => {
  it('выборы мастерства игроку не задаются', () => {
    const prepared = engine.prepareFeatChoices(LEGACY_FEAT_DATA.choices);

    assert.deepEqual(
      prepared.map((choice) => [
        choice.key,
        engine.resolveFeatChoiceTypes(choice),
      ]),
      [
        ['mixed', ['weapon']],
        ['skill', ['skill']],
      ],
    );

    assert.deepEqual(
      engine
        .expandChoiceScaling(LEGACY_FEAT_DATA.choices)
        .map((choice) => choice.key),
      ['mixed', 'skill'],
    );
  });

  it('ответы на выборы мастерства ничего не выдают', () => {
    const selections = {
      mastery: ['longsword'],
      property: ['topple'],
      skill: ['athletics'],
    };

    const chosen = engine.collectFeatChoiceProficiencies(
      LEGACY_FEAT_DATA,
      selections,
    );

    assert.equal('weaponMasteries' in chosen, false);
    assert.equal('masteryProperties' in chosen, false);
    assert.deepEqual(chosen.skills, ['athletics']);
    assert.deepEqual(chosen.weapons, []);

    const actor = createActor();
    const proficiencies = structuredClone(actor.system.proficiencies);

    engine.applyFeatChoiceSelections(
      proficiencies,
      LEGACY_FEAT_DATA,
      selections,
      actor,
    );

    engine.applyFeatDataProficiencies(proficiencies, LEGACY_FEAT_DATA);

    assert.equal(proficiencies.weaponMasteries, undefined);
    assert.equal(proficiencies.masteryProperties, undefined);
    assert.deepEqual(proficiencies.weapons, ['longsword']);
  });

  it('требование «Оружейные приёмы» пропускается', () => {
    const check = engine.checkFeatPrerequisites(
      LEGACY_FEAT_DATA,
      createActor(),
    );

    assert.deepEqual(check, { met: true, unmet: [] });
  });

  it('сводка даров не упоминает приёмы', () => {
    const summary = engine.buildFeatGrantsSummary({
      name: 'Мастер оружия',
      featData: LEGACY_FEAT_DATA,
    });

    assert.doesNotMatch(summary, /приём|weaponMastery/iu);
  });
});
