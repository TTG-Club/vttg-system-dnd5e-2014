/**
 * Доля урона после спасброска с учётом защит цели: «Увёртливость» и «успех
 * против магии — без урона».
 *
 * Одна точка для всех путей «половина при успехе»: спасбросок заклинания,
 * действия существа и оружия, спасбросок эффекта при наложении и срабатывания,
 * урон каждый ход. Флаги цели читаются здесь, чтобы «Увёртливость» не
 * пришлось повторять в каждом пути.
 */

import type { AbilityType } from '@vtt/shared';

import type { Spell } from './dndEntities.js';

import { buildSaveEvasionFlag } from './activeEffectTypes.js';

/** Доля урона при успешном спасброске «половина урона» */
export const HALF_DAMAGE_SCALE = 0.5;

/** Флаг «успешный спасбросок против магии — урона нет» */
const NEGATE_ON_MAGIC_SUCCESS_FLAG = 'save.negateOnSuccess.vsMagic';

/** Что известно о бросившем спасбросок «половина при успехе» */
export interface SaveDamageDefense {
  /** Активные флаги бросившего */
  flags: ReadonlySet<string>;
  /** Характеристика спасброска */
  ability: AbilityType;
  /** Спасбросок навязан магией */
  againstMagic?: boolean;
}

/**
 * Доля урона «половина при успехе» по исходу спасброска и защитам цели.
 *
 * - «Увёртливость» характеристики: успех — без урона, провал — половина;
 * - «успех против магии — без урона»: только успех, провал — полный урон;
 * - без защит: успех — половина, провал — полный.
 *
 * @param passed - пройден ли спасбросок
 * @param defense - флаги и обстоятельства бросившего; без них защит нет
 * @returns доля урона
 */
export function resolveHalfDamageScale(
  passed: boolean,
  defense?: SaveDamageDefense,
): number {
  // В PHB 2014 «Увёртливость» действует и на недееспособного: оговорка о
  // недееспособности появилась только в 2024
  const hasEvasion =
    defense !== undefined
    && defense.flags.has(buildSaveEvasionFlag(defense.ability));

  if (!passed) {
    return hasEvasion ? HALF_DAMAGE_SCALE : 1;
  }

  const negatesOnMagic =
    defense?.againstMagic === true
    && defense.flags.has(NEGATE_ON_MAGIC_SUCCESS_FLAG);

  return hasEvasion || negatesOnMagic ? 0 : HALF_DAMAGE_SCALE;
}

/**
 * Урон части после спасброска: доля по `saveEffect`, округление вниз.
 *
 * @param amount - брошенный урон
 * @param saveEffect - что даёт успешный спасбросок
 * @param passed - пройден ли спасбросок; `undefined` — спасброска не было
 * @param defense - флаги и обстоятельства бросившего
 * @returns урон до защит цели
 */
export function scaleSaveDamage(
  amount: number,
  saveEffect: Spell['saveEffect'],
  passed: boolean | undefined,
  defense?: SaveDamageDefense,
): number {
  return Math.floor(
    amount * resolveSaveEffectScale(saveEffect, passed, defense),
  );
}

/**
 * Доля урона заклинания, оружия или действия существа по его `saveEffect`.
 *
 * @param saveEffect - что даёт успешный спасбросок
 * @param passed - пройден ли спасбросок; `undefined` — спасброска не было
 * @param defense - флаги и обстоятельства бросившего
 * @returns доля урона
 */
export function resolveSaveEffectScale(
  saveEffect: Spell['saveEffect'],
  passed: boolean | undefined,
  defense?: SaveDamageDefense,
): number {
  if (passed === undefined) {
    return 1;
  }

  switch (saveEffect) {
    case 'half':
      return resolveHalfDamageScale(passed, defense);
    case 'none':
      return passed ? 0 : 1;
    default:
      // «Особое» — полный урон: исход разбирает ведущий
      return 1;
  }
}
