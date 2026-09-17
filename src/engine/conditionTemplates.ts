/**
 * Шаблоны Active Effects для состояний D&D 5e (PHB 2014)
 *
 * Каждый шаблон содержит предзаготовленные changes (числовые) и flags (булевые),
 * которые применяются автоматически при активации состояния на акторе.
 *
 * Истощение — особый случай с уровнями (1–6). В редакции 2014 это НЕ линейный
 * штраф, как в 2024, а таблица из шести разнородных эффектов, накапливающихся
 * поверх предыдущих (см. {@link buildExhaustionEffect}).
 */

import type { MovementType } from '@vtt/shared';
import type {
  ActiveEffect,
  EffectChange,
  EffectDuration,
  EffectFlagKey,
  EffectOrigin,
} from './activeEffectTypes.js';
import type { ConditionKey } from './conditionKeys.js';

import { generateId } from '@vtt/shared';
import { DEFAULT_EFFECT_CHANGE_PRIORITY } from './activeEffectTypes.js';
import { CONDITIONS } from './consts.js';

// ── Типы ──────────────────────────────────────────────────────

/** Шаблон эффекта для состояния D&D 5e */
export interface ConditionEffectTemplate {
  /** Числовые модификаторы */
  changes: EffectChange[];
  /** Булевые флаги */
  flags: EffectFlagKey[];
  /**
   * Состояния, к которым это состояние даёт иммунитет (напр. Окаменевший →
   * иммунитет к Отравлению). Прокидывается в `ActiveEffect.conditionImmunities`
   * и блокирует наложение состояния через `getEntityConditionImmunities`.
   */
  conditionImmunities?: ConditionKey[];
  /** Есть ли уровни (для Exhaustion) */
  hasLevels?: boolean;
  /** Максимальный уровень (для Exhaustion) */
  maxLevel?: number;
}

// ── Шаблоны Conditions ────────────────────────────────────────

/**
 * Шаблоны Active Effects для всех D&D 5e Conditions.
 *
 * Используются при клике на иконку состояния в ActorEffectsTab:
 * 1. Находим шаблон по ConditionKey
 * 2. Создаём ActiveEffect с changes и flags из шаблона
 * 3. Добавляем в actor.activeEffects
 */
export const CONDITION_EFFECT_TEMPLATES: Record<
  ConditionKey,
  ConditionEffectTemplate
> = {
  blinded: {
    changes: [],
    flags: [
      'attack.disadvantage',
      'attacksAgainst.advantage',
      'vision.blinded',
    ],
  },

  charmed: {
    changes: [],
    flags: [],
    // Механика «нельзя атаковать» — специфичная, не через числа/флаги
  },

  deafened: {
    changes: [],
    flags: [],
    // Автопровал проверок слуха — специфичная механика
  },

  exhaustion: {
    changes: [],
    flags: [],
    hasLevels: true,
    maxLevel: 6,
    // Changes и flags генерируются по уровню — см. buildExhaustionEffect()
  },

  frightened: {
    changes: [],
    flags: ['attack.disadvantage', 'abilityCheck.disadvantage'],
  },

  grappled: {
    changes: [],
    flags: ['speed.zero'],
  },

  incapacitated: {
    changes: [],
    // В редакции 2014 недееспособность — это только «не может совершать
    // действия и реакции». Помеху на инициативу и обрыв концентрации добавил
    // 2024-й, здесь их нет.
    flags: ['incapacitated'],
  },

  invisible: {
    changes: [],
    flags: [
      'attack.advantage',
      'attacksAgainst.disadvantage',
      'vision.invisible',
    ],
  },

  paralyzed: {
    changes: [],
    flags: [
      'incapacitated',
      'speed.zero',
      'save.autoFail.strength',
      'save.autoFail.dexterity',
      'attacksAgainst.advantage',
    ],
    // Крит в пределах 5 фт автоматизировать нечем (нет флага «крит по мне»).
  },

  petrified: {
    changes: [],
    flags: [
      'incapacitated',
      'speed.zero',
      'save.autoFail.strength',
      'save.autoFail.dexterity',
      'attacksAgainst.advantage',
      // Сопротивление всему урону — по типу на каждый вид урона.
      'resistance.slashing',
      'resistance.piercing',
      'resistance.bludgeoning',
      'resistance.fire',
      'resistance.cold',
      'resistance.lightning',
      'resistance.thunder',
      'resistance.poison',
      'resistance.acid',
      'resistance.necrotic',
      'resistance.radiant',
      'resistance.force',
      'resistance.psychic',
    ],
    // Иммунитет к Отравлению (само состояние; урон ядом — лишь сопротивление).
    conditionImmunities: ['poisoned'],
  },

  poisoned: {
    changes: [],
    flags: ['attack.disadvantage', 'abilityCheck.disadvantage'],
  },

  prone: {
    changes: [],
    flags: ['attack.disadvantage'],
    // Примечание: атаки в пределах 5 фт с преимуществом, дальше — с помехой
    // Дистанционная логика — будущая итерация
  },

  restrained: {
    changes: [],
    flags: [
      'speed.zero',
      'attack.disadvantage',
      'attacksAgainst.advantage',
      'save.disadvantage.dexterity',
    ],
  },

  stunned: {
    changes: [],
    flags: [
      'incapacitated',
      // В 2014 Ошеломлённый «не может двигаться» — скорость обнуляется.
      // 2024-я редакция этот пункт убрала, здесь он возвращён.
      'speed.zero',
      'save.autoFail.strength',
      'save.autoFail.dexterity',
      'attacksAgainst.advantage',
    ],
  },

  unconscious: {
    changes: [],
    flags: [
      'incapacitated',
      'speed.zero',
      'save.autoFail.strength',
      'save.autoFail.dexterity',
      'attacksAgainst.advantage',
      // Без сознания включает Лежащего ничком → помеха на свои броски атаки.
      'attack.disadvantage',
    ],
    // Крит в пределах 5 фт автоматизировать нечем (нет флага «крит по мне»).
  },
};

// ── Истощение ─────────────────────────────────────────────────

/** Максимальный уровень истощения (6 — смерть) */
const EXHAUSTION_MAX_LEVEL = 6;

/** Виды скорости, которые режет истощение 2 уровня */
const EXHAUSTION_MOVEMENT_KEYS: readonly MovementType[] = [
  'walk',
  'fly',
  'swim',
  'climb',
  'burrow',
];

/** Множитель «вдвое меньше» для скорости и максимума хитов */
const EXHAUSTION_HALVE = '0.5';

/** Результат сборки истощения: числовые изменения и булевы флаги */
export interface ExhaustionEffectParts {
  changes: EffectChange[];
  flags: EffectFlagKey[];
}

/**
 * Собирает эффекты истощения для заданного уровня (PHB 2014).
 *
 * Таблица 2014 — не арифметика, как в 2024 (там каждый уровень даёт −2 ко всем
 * d20 и −5 фт скорости), а шесть разнородных ступеней, накапливающихся поверх
 * предыдущих:
 *
 * | Уровень | Эффект |
 * |---|---|
 * | 1 | помеха на проверки характеристик |
 * | 2 | скорость уменьшена вдвое |
 * | 3 | помеха на броски атаки и спасброски |
 * | 4 | максимум хитов уменьшен вдвое |
 * | 5 | скорость снижена до 0 |
 * | 6 | смерть |
 *
 * Ступени 2 и 4 — множители, а не прибавки, и применяются ОДИН раз: на 3 и 4
 * уровнях скорость уже половинная и вдвое ещё раз не режется.
 *
 * Уровень 6 (смерть) модификаторов не добавляет — её обрабатывает UI.
 *
 * @param exhaustionLevel - текущий уровень истощения (1–6)
 * @returns числовые изменения и флаги для этого уровня
 */
export function buildExhaustionEffect(
  exhaustionLevel: number,
): ExhaustionEffectParts {
  const level = Math.max(0, Math.min(exhaustionLevel, EXHAUSTION_MAX_LEVEL));

  if (level === 0) {
    return { changes: [], flags: [] };
  }

  const changes: EffectChange[] = [];
  const flags: EffectFlagKey[] = ['abilityCheck.disadvantage'];

  // 2 уровень: скорость вдвое. На 5 уровне её обнулит флаг `speed.zero`, но
  // множитель остаётся — он безвреден и переживает снятие пятого уровня.
  if (level >= 2) {
    for (const movement of EXHAUSTION_MOVEMENT_KEYS) {
      changes.push({
        key: `movement.${movement}`,
        mode: 'multiply',
        value: EXHAUSTION_HALVE,
        priority: DEFAULT_EFFECT_CHANGE_PRIORITY,
      });
    }
  }

  // 3 уровень: помеха на атаки и спасброски.
  if (level >= 3) {
    flags.push('attack.disadvantage', 'save.disadvantage');
  }

  // 4 уровень: максимум хитов вдвое.
  if (level >= 4) {
    changes.push({
      key: 'hitPoints.max',
      mode: 'multiply',
      value: EXHAUSTION_HALVE,
      priority: DEFAULT_EFFECT_CHANGE_PRIORITY,
    });
  }

  // 5 уровень: скорость 0.
  if (level >= 5) {
    flags.push('speed.zero');
  }

  return { changes, flags };
}

// ── Сборка эффекта состояния ──────────────────────────────────

/** Опции сборки ActiveEffect для состояния */
export interface BuildConditionEffectOptions {
  /** Источник эффекта (по умолчанию `condition`) */
  origin?: EffectOrigin;
  /** Длительность (по умолчанию постоянная) */
  duration?: EffectDuration;
  /** Цель применения: на себя или на цель атаки (для райдеров — `target`) */
  effectTarget?: 'self' | 'target';
  /** Уровень истощения (учитывается только для `exhaustion`) */
  exhaustionLevel?: number;
}

/**
 * Собирает ActiveEffect для состояния D&D 5e из шаблона.
 *
 * Единый источник правды для наложения состояний (тоггл на листе актора,
 * применение по цели атаки, райдеры). Проставляет `conditionKey` — он нужен
 * для проверки иммунитета цели и устойчивого опознания состояния.
 *
 * @param conditionKey - ключ состояния
 * @param options - источник, длительность, цель применения, уровень истощения
 * @returns готовый ActiveEffect или `null`, если состояние неизвестно
 */
export function buildConditionActiveEffect(
  conditionKey: ConditionKey,
  options: BuildConditionEffectOptions = {},
): ActiveEffect | null {
  const condition = CONDITIONS.find((entry) => entry.key === conditionKey);

  if (!condition) {
    return null;
  }

  const template = CONDITION_EFFECT_TEMPLATES[conditionKey];

  // Истощение — единственное состояние, у которого И changes, И flags зависят
  // от уровня: в редакции 2014 его ступени разнородны (помехи, множители
  // скорости и максимума хитов), а не сводятся к одному числовому штрафу.
  const exhaustion =
    conditionKey === 'exhaustion'
      ? buildExhaustionEffect(options.exhaustionLevel ?? 1)
      : null;

  const effect: ActiveEffect = {
    id: generateId('effect'),
    name: condition.nameRu,
    description: condition.description,
    icon: condition.icon,
    disabled: false,
    origin: options.origin ?? 'condition',
    transfer: false,
    duration: options.duration ?? { type: 'permanent' },
    changes: exhaustion ? exhaustion.changes : [...template.changes],
    flags: exhaustion ? exhaustion.flags : [...template.flags],
    conditionKey,
  };

  if (options.effectTarget) {
    effect.effectTarget = options.effectTarget;
  }

  if (template.conditionImmunities && template.conditionImmunities.length > 0) {
    effect.conditionImmunities = [...template.conditionImmunities];
  }

  return effect;
}
