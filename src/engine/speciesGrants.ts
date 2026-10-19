import type { AbilityType, MovementType } from '@vtt/shared';

import type { DnDActor } from './dndEntities.js';
import type { FeatData } from './featTypes.js';
import type { GrantedSpellSource } from './grantedSpells.js';
import type {
  GrantedSpellRef,
  SpeciesDefinition,
  SpeciesFeature,
} from './speciesTypes.js';
import type { ActorCounterState } from './types.js';

import { ABILITY_OPTIONS, isAbilityType } from './consts.js';
import { counterIdentity } from './counterIds.js';
import { ABILITY_INCREASE_CHOICE_KEY } from './featChoices.js';
import {
  buildFeatCounters,
  isSpeciesCounter,
  speciesCounterOwnerId,
} from './featGrants.js';

/**
 * Хелперы расчёта уровне-зависимых даров вида.
 *
 * Особенности вида могут появляться на разных уровнях персонажа и быть
 * привязаны к выбранному подвиду. Подвид задаётся двумя способами (дуал-рид):
 * легаси-вариантами внутри особенностей (`chosenSubspecies` — ключи выбранных
 * `SpeciesFeature.choices`) либо самостоятельной записью-подвидом с `parentKey`
 * (`subspecies`). Эти чистые функции используются и мастером настройки вида
 * (применение при добавлении), и листом актёра (пересчёт скорости/тёмного
 * зрения при повышении уровня).
 */

/** Оси скорости движения, которыми оперируют дары вида. */
const MOVEMENT_AXES: ReadonlyArray<
  Extract<MovementType, keyof SpeciesDefinition['speed']>
> = ['walk', 'fly', 'swim', 'climb', 'burrow'];

/**
 * Собирает плоский список особенностей вида с учётом выбранного подвида:
 * базовые особенности вида, особенности выбранных легаси-вариантов и
 * особенности записи-подвида. Уровень НЕ фильтруется — это делает вызывающий
 * код (для применения хранит все, для показа фильтрует по достижению уровня).
 *
 * @param definition - определение вида
 * @param chosenSubspecies - выбранные ключи легаси-вариантов
 * @param subspecies - выбранная запись-подвид; пусто — не выбрана
 * @returns базовые особенности + особенности выбранного подвида
 */
export function collectSpeciesFeatures(
  definition: SpeciesDefinition,
  chosenSubspecies: ReadonlyArray<string>,
  subspecies?: SpeciesDefinition | null,
): SpeciesFeature[] {
  const features: SpeciesFeature[] = [];

  for (const feature of definition.features) {
    features.push(feature);

    for (const choice of feature.choices ?? []) {
      if (!chosenSubspecies.includes(choice.key)) {
        continue;
      }

      for (const subspeciesFeature of choice.features ?? []) {
        features.push(subspeciesFeature);
      }
    }
  }

  for (const feature of subspecies?.features ?? []) {
    features.push(feature);
  }

  return features;
}

/**
 * Активна ли особенность на текущем уровне персонажа.
 *
 * @param feature - особенность вида
 * @param totalLevel - суммарный уровень персонажа
 * @returns true, если особенность уже получена по уровню
 */
export function isSpeciesFeatureActive(
  feature: SpeciesFeature,
  totalLevel: number,
): boolean {
  return (feature.level ?? 1) <= totalLevel;
}

/**
 * Считает итоговую скорость движения вида: базовая скорость плюс «не ниже»
 * прибавки от записи-подвида и от активных на текущем уровне особенностей.
 *
 * Скорости из `featData.modifiers` сюда не входят: их применяет синтетический
 * эффект даров (`buildFeatGrantEffect`), живущий на акторе своей записью.
 *
 * @param definition - определение вида
 * @param totalLevel - суммарный уровень персонажа
 * @param chosenSubspecies - выбранные ключи легаси-вариантов
 * @param subspecies - выбранная запись-подвид; пусто — не выбрана
 * @returns скорость по осям walk/fly/swim/climb/burrow
 */
export function computeSpeciesMovement(
  definition: SpeciesDefinition,
  totalLevel: number,
  chosenSubspecies: ReadonlyArray<string>,
  subspecies?: SpeciesDefinition | null,
): Record<(typeof MOVEMENT_AXES)[number], number> {
  const movement: Record<(typeof MOVEMENT_AXES)[number], number> = {
    walk: definition.speed.walk,
    fly: definition.speed.fly ?? 0,
    swim: definition.speed.swim ?? 0,
    climb: definition.speed.climb ?? 0,
    burrow: definition.speed.burrow ?? 0,
  };

  if (subspecies) {
    for (const axis of MOVEMENT_AXES) {
      const value = subspecies.speed[axis];

      if (typeof value === 'number' && value > movement[axis]) {
        movement[axis] = value;
      }
    }
  }

  const features = collectSpeciesFeatures(
    definition,
    chosenSubspecies,
    subspecies,
  );

  for (const feature of features) {
    if (!feature.movement || feature.isInformationalOnly) {
      continue;
    }

    if (!isSpeciesFeatureActive(feature, totalLevel)) {
      continue;
    }

    for (const axis of MOVEMENT_AXES) {
      const value = feature.movement[axis];

      if (typeof value === 'number' && value > movement[axis]) {
        movement[axis] = value;
      }
    }
  }

  return movement;
}

/**
 * Считает дальность тёмного зрения вида: максимум из легаси-даров `darkvision`,
 * блоков `featData` (записи, подвида и активных особенностей) и активных на
 * текущем уровне особенностей с полем `darkvision`.
 *
 * @param definition - определение вида
 * @param totalLevel - суммарный уровень персонажа
 * @param chosenSubspecies - выбранные ключи легаси-вариантов
 * @param subspecies - выбранная запись-подвид; пусто — не выбрана
 * @returns дальность тёмного зрения в футах (0, если нет)
 */
export function computeSpeciesDarkvision(
  definition: SpeciesDefinition,
  totalLevel: number,
  chosenSubspecies: ReadonlyArray<string>,
  subspecies?: SpeciesDefinition | null,
): number {
  let darkvision = 0;

  const raise = (value: number | undefined): void => {
    if (typeof value === 'number' && value > darkvision) {
      darkvision = value;
    }
  };

  for (const record of subspecies ? [definition, subspecies] : [definition]) {
    for (const grant of record.grants ?? []) {
      if (grant.type === 'darkvision') {
        raise(grant.range);
      }
    }

    raise(record.featData?.darkvision);
  }

  const features = collectSpeciesFeatures(
    definition,
    chosenSubspecies,
    subspecies,
  );

  for (const feature of features) {
    if (feature.isInformationalOnly) {
      continue;
    }

    if (!isSpeciesFeatureActive(feature, totalLevel)) {
      continue;
    }

    raise(feature.darkvision);
    raise(feature.featData?.darkvision);
  }

  return darkvision;
}

/**
 * Дальность обычного зрения вида: запись-подвид переопределяет родителя, как
 * и скоростью. Ни у кого не задано — `undefined`: токен оставляет свою
 * дальность, а не сбрасывается в «без ограничений».
 *
 * @param definition - определение вида
 * @param subspecies - выбранная запись-подвид; пусто — не выбрана
 * @returns дальность в футах либо `undefined`
 */
export function resolveSpeciesVision(
  definition: SpeciesDefinition,
  subspecies?: SpeciesDefinition | null,
): number | undefined {
  return subspecies?.vision ?? definition.vision;
}

/** Один источник блока даров `featData` у вида: запись целиком или особенность. */
export interface SpeciesFeatDataSource {
  /** Стабильный ключ источника — им подписываются эффект даров и ответы игрока. */
  sourceKey: string;
  /** Название источника — им подписывается эффект даров на акторе. */
  sourceName: string;
  featData: FeatData;
}

/**
 * Собирает источники блоков даров `featData` вида: сама запись, запись-подвид и
 * активные на текущем уровне особенности (включая особенности подвида и
 * выбранных легаси-вариантов). Информационные особенности даров не дают.
 *
 * Общий для мастера (применение и вопросы к игроку) и отката: оба обязаны
 * видеть один и тот же список источников, иначе снятие вида оставило бы дары.
 *
 * @param definition - определение вида
 * @param totalLevel - суммарный уровень персонажа
 * @param chosenSubspecies - выбранные ключи легаси-вариантов
 * @param subspecies - выбранная запись-подвид; пусто — не выбрана
 * @returns источники блоков даров в порядке применения
 */
export function collectSpeciesFeatDataSources(
  definition: SpeciesDefinition,
  totalLevel: number,
  chosenSubspecies: ReadonlyArray<string>,
  subspecies?: SpeciesDefinition | null,
): SpeciesFeatDataSource[] {
  const sources: SpeciesFeatDataSource[] = [];

  if (definition.featData) {
    sources.push({
      sourceKey: definition.key,
      sourceName: definition.name,
      featData: definition.featData,
    });
  }

  if (subspecies?.featData) {
    sources.push({
      sourceKey: subspecies.key,
      sourceName: subspecies.name,
      featData: subspecies.featData,
    });
  }

  const features = collectSpeciesFeatures(
    definition,
    chosenSubspecies,
    subspecies,
  );

  for (const feature of features) {
    if (!feature.featData || feature.isInformationalOnly) {
      continue;
    }

    if (!isSpeciesFeatureActive(feature, totalLevel)) {
      continue;
    }

    sources.push({
      sourceKey: `feature:${feature.key}`,
      sourceName: feature.name,
      featData: feature.featData,
    });
  }

  return sources;
}

/**
 * Пересобирает ресурсы вида по его источникам даров на текущем уровне.
 *
 * Источники — те же, что применяет мастер ({@link collectSpeciesFeatDataSources}):
 * запись, подвид и активные на уровне особенности. Считаются ресурсы тем же
 * {@link buildFeatCounters}, что и у черты: ступени идут от уровня персонажа,
 * потраченное сохраняется, а ресурс, которого до сих пор не было, приходит
 * полным. Ресурсы вида, чьих источников больше нет (вид сменили, подвид другой),
 * снимаются.
 *
 * Счётчики остаются на своих местах: пересчёт идёт на каждой смене уровня, и
 * плитки листа не должны каждый раз переезжать в конец списка.
 *
 * @param actor - лист персонажа: уровень, характеристики, бонус мастерства
 * @param counters - текущий список счётчиков актора
 * @param sources - источники даров вида; пусто — ресурсов вида не остаётся
 * @param featDataChoices - ответы игрока по ключу источника: из них берётся
 * заклинательная характеристика для `@mod.spell`
 * @returns новый список: чужие счётчики как были, ресурсы вида пересчитаны
 */
export function refreshSpeciesCounters(
  actor: DnDActor,
  counters: ReadonlyArray<ActorCounterState>,
  sources: ReadonlyArray<SpeciesFeatDataSource>,
  featDataChoices: Record<string, Record<string, string[]>> = {},
): ActorCounterState[] {
  const rebuilt = new Map<string, ActorCounterState>();

  for (const source of sources) {
    const built = buildFeatCounters(
      {
        id: speciesCounterOwnerId(source.sourceKey),
        featData: source.featData,
        choices: featDataChoices[source.sourceKey],
      },
      actor,
      counters,
    );

    for (const counter of built) {
      rebuilt.set(counterIdentity(counter), counter);
    }
  }

  const result: ActorCounterState[] = [];

  for (const counter of counters) {
    if (!isSpeciesCounter(counter)) {
      result.push(counter);

      continue;
    }

    const identity = counterIdentity(counter);
    const replacement = rebuilt.get(identity);

    // Взятая замена убирается из очереди: повтор того же ресурса в списке
    // второй плиткой не вернётся
    if (replacement) {
      result.push(replacement);
      rebuilt.delete(identity);
    }
  }

  return [...result, ...rebuilt.values()];
}

/**
 * Снимает с листа все ресурсы, выданные видом.
 *
 * @param counters - текущий список счётчиков актора
 * @returns счётчики без ресурсов вида
 */
export function removeSpeciesCounters(
  counters: ReadonlyArray<ActorCounterState>,
): ActorCounterState[] {
  return counters.filter((counter) => !isSpeciesCounter(counter));
}

/**
 * Уровень персонажа, на котором вид выдаёт заклинание: уровень особенности или
 * уровень самого заклинания, смотря что позже.
 *
 * @param feature - особенность вида
 * @param ref - заклинание особенности
 * @returns уровень персонажа, с которого заклинание доступно
 */
export function speciesSpellOpensAt(
  feature: Pick<SpeciesFeature, 'level'>,
  ref: Pick<GrantedSpellRef, 'requiredLevel'>,
): number {
  return Math.max(feature.level ?? 1, ref.requiredLevel ?? 1);
}

/**
 * Выдан ли видом заклинание на этом уровне персонажа.
 *
 * Вид выбирают и до класса, когда уровней ещё нет, — такой лист считается
 * персонажем первого уровня, иначе вид не выдал бы даже заговор.
 *
 * @param feature - особенность вида
 * @param ref - заклинание особенности
 * @param characterLevel - суммарный уровень персонажа (0 — классов ещё нет)
 * @returns true, если заклинание уже открыто
 */
export function isSpeciesSpellOpen(
  feature: Pick<SpeciesFeature, 'level'>,
  ref: Pick<GrantedSpellRef, 'requiredLevel'>,
  characterLevel: number,
): boolean {
  return speciesSpellOpensAt(feature, ref) <= Math.max(1, characterLevel);
}

/**
 * Собирает связи «заклинание компендиума → особенность-источник» из вида —
 * включая особенности легаси-вариантов и записи-подвида. Берёт только
 * связанные с компендиумом (`spellId`) заклинания; дедуп по `spellId`.
 * Используется резолвером granted-заклинаний для подгрузки данных из
 * компендиума.
 *
 * Заклинание открывается на уровне персонажа: на уровне особенности или на своём
 * `requiredLevel`, смотря что позже. У «Наследия преисподней» особенность одна, а
 * заклинания 3-го и 5-го уровня приходят позже заговора — без проверки вид
 * выдавал бы их сразу.
 *
 * @param definition - определение вида
 * @param subspecies - выбранная запись-подвид; пусто — не выбрана
 * @param options - ограничения выдачи
 * @param options.characterLevel - суммарный уровень персонажа (0 — классов ещё
 *   нет, считается первым); пусто — без проверки уровня
 * @param options.featureChoices - выбранные легаси-варианты (ключ особенности →
 *   ключ варианта); пусто — особенности всех вариантов
 * @returns источники granted-заклинаний (только со `spellId`)
 */
export function collectSpeciesGrantedSpellSources(
  definition: SpeciesDefinition,
  subspecies?: SpeciesDefinition | null,
  options: {
    characterLevel?: number;
    featureChoices?: Record<string, string>;
  } = {},
): GrantedSpellSource[] {
  const { characterLevel, featureChoices } = options;
  const sources: GrantedSpellSource[] = [];
  const seenSpellIds = new Set<string>();

  const addFromFeature = (feature: SpeciesFeature): void => {
    if (feature.isInformationalOnly) {
      return;
    }

    for (const ref of feature.grantedSpells ?? []) {
      if (!ref.spellId || seenSpellIds.has(ref.spellId)) {
        continue;
      }

      if (
        characterLevel !== undefined
        && !isSpeciesSpellOpen(feature, ref, characterLevel)
      ) {
        continue;
      }

      seenSpellIds.add(ref.spellId);

      sources.push({
        spellId: ref.spellId,
        featureName: feature.name,
        packId: ref.packId,
        // Врождённые заклинания вида доступны без подготовки по правилу источника.
        alwaysPrepared: ref.alwaysPrepared ?? true,
      });
    }
  };

  for (const feature of definition.features) {
    addFromFeature(feature);

    for (const choice of feature.choices ?? []) {
      if (featureChoices && featureChoices[feature.key] !== choice.key) {
        continue;
      }

      for (const choiceFeature of choice.features ?? []) {
        addFromFeature(choiceFeature);
      }
    }
  }

  for (const feature of subspecies?.features ?? []) {
    addFromFeature(feature);
  }

  return sources;
}

/**
 * Повышение характеристик одного источника даров вида — расы, подрасы или
 * особенности.
 *
 * В редакции 2014 характеристики поднимает раса, а не предыстория: дварф даёт
 * +2 Телосложения, горный дварф сверху +2 Силы, полуэльф — +2 Харизмы и по +1
 * к двум другим на выбор. Хранится повышение в блоке даров записи
 * (`featData.abilityScoreIncrease`) — той же формы, что у черты, поэтому его
 * правит общий редактор даров, а применяет общий эффект даров
 * (`buildFeatGrantEffect`).
 */
export interface SpeciesAbilityIncrease {
  /** Ключ источника — под ним лежат ответы игрока ({@link SpeciesFeatDataSource.sourceKey}) */
  sourceKey: string;
  /** Название источника — подпись группы в мастере */
  sourceName: string;
  /** Фиксированные прибавки: применяются без вопросов */
  fixed: Partial<Record<AbilityType, number>>;
  /** Прибавка на выбор; `null` — выбирать нечего */
  choice: SpeciesAbilityIncreaseChoice | null;
}

/** Прибавка характеристик на выбор: `+amount` к `count` характеристикам из `from`. */
export interface SpeciesAbilityIncreaseChoice {
  /** Ключ ответа в блоке ответов источника — тот же, что читает эффект даров */
  key: string;
  amount: number;
  count: number;
  /** Характеристики, из которых выбирают */
  from: AbilityType[];
}

/**
 * Собирает повышения характеристик из источников даров вида.
 *
 * Пустой набор `from` у выбора означает «любая, кроме уже поднятых этим же
 * источником»: так в PHB 2014 записан полуэльф — «две другие характеристики на
 * ваш выбор». Повышение, привязанное к чужому выбору (`fromChoiceKey`), здесь не
 * спрашивается: его характеристику называет ответ на тот выбор.
 *
 * @param sources - источники даров вида ({@link collectSpeciesFeatDataSources})
 * @returns повышения источников, у которых они есть
 */
export function collectSpeciesAbilityIncreases(
  sources: ReadonlyArray<SpeciesFeatDataSource>,
): SpeciesAbilityIncrease[] {
  const increases: SpeciesAbilityIncrease[] = [];

  for (const source of sources) {
    const increase = source.featData.abilityScoreIncrease;

    if (!increase) {
      continue;
    }

    const fixed: Partial<Record<AbilityType, number>> = {};

    for (const [ability, bonus] of Object.entries(increase.fixed ?? {})) {
      if (isAbilityType(ability) && typeof bonus === 'number' && bonus !== 0) {
        fixed[ability] = bonus;
      }
    }

    let choice: SpeciesAbilityIncreaseChoice | null = null;

    if (increase.choice && !increase.fromChoiceKey) {
      const from =
        increase.choice.from && increase.choice.from.length > 0
          ? increase.choice.from.filter(isAbilityType)
          : ABILITY_OPTIONS.map((option) => option.value).filter(
              (ability) => fixed[ability] === undefined,
            );

      choice = {
        key: ABILITY_INCREASE_CHOICE_KEY,
        amount: increase.choice.amount ?? 1,
        count: Math.min(
          increase.choice.count > 0 ? increase.choice.count : 1,
          from.length,
        ),
        from,
      };
    }

    if (Object.keys(fixed).length === 0 && !choice) {
      continue;
    }

    increases.push({
      sourceKey: source.sourceKey,
      sourceName: source.sourceName,
      fixed,
      choice,
    });
  }

  return increases;
}

/**
 * Итоговые прибавки характеристик вида: фиксированные всех источников плюс
 * выбранные игроком.
 *
 * @param increases - повышения источников ({@link collectSpeciesAbilityIncreases})
 * @param answers - ответы игрока: ключ источника → ответы его блока даров
 * @returns прибавка по характеристике; характеристик без прибавки в нём нет
 */
export function sumSpeciesAbilityIncreases(
  increases: ReadonlyArray<SpeciesAbilityIncrease>,
  answers: Record<string, Record<string, string[]>>,
): Partial<Record<AbilityType, number>> {
  const totals: Partial<Record<AbilityType, number>> = {};

  const add = (ability: AbilityType, bonus: number): void => {
    totals[ability] = (totals[ability] ?? 0) + bonus;
  };

  for (const increase of increases) {
    for (const [ability, bonus] of Object.entries(increase.fixed)) {
      if (isAbilityType(ability) && typeof bonus === 'number') {
        add(ability, bonus);
      }
    }

    if (!increase.choice) {
      continue;
    }

    const { choice } = increase;

    for (const ability of answers[increase.sourceKey]?.[choice.key] ?? []) {
      if (isAbilityType(ability) && choice.from.includes(ability)) {
        add(ability, choice.amount);
      }
    }
  }

  return totals;
}

/**
 * Сделаны ли все выборы прибавок: в каждой группе выбрано ровно столько
 * характеристик, сколько она даёт.
 *
 * @param increases - повышения источников ({@link collectSpeciesAbilityIncreases})
 * @param answers - ответы игрока: ключ источника → ответы его блока даров
 */
export function areSpeciesAbilityChoicesComplete(
  increases: ReadonlyArray<SpeciesAbilityIncrease>,
  answers: Record<string, Record<string, string[]>>,
): boolean {
  return increases.every(
    (increase) =>
      !increase.choice
      || (answers[increase.sourceKey]?.[increase.choice.key] ?? []).length
        === increase.choice.count,
  );
}
