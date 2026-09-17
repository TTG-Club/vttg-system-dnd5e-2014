import type {
  AbilityType,
  DefensibleDamageType,
  SkillType,
} from '@vtt/shared';

import type { CreatureSize } from './types.js';

/**
 * Ключ вида (открытый тип, как и `BackgroundKey`).
 *
 * Канонические виды SRD: `human`, `elf`, `dwarf`, `halfling`, `gnome`,
 * `half-orc`, `tiefling`, `dragonborn`, `goliath`, `aasimar`. Пользовательские
 * виды, созданные в мире, получают сгенерированный slug-ключ.
 */
export type SpeciesKey = string;

export type CreatureType =
  | 'humanoid'
  | 'fey'
  | 'construct'
  | 'celestial'
  | 'fiend'
  | 'undead'
  | 'elemental'
  | 'monstrosity'
  | 'aberration'
  | 'dragon'
  | 'beast'
  | 'giant'
  | 'ooze'
  | 'plant'
  | 'swarm';

export type SpeciesGrant =
  | SkillProficiencyGrant
  | WeaponProficiencyGrant
  | ArmorProficiencyGrant
  | ToolProficiencyGrant
  | SavingThrowProficiencyGrant
  | LanguageGrant
  | DamageDefenseGrant
  | ConditionImmunityGrant
  | DarkvisionGrant;

export interface SkillProficiencyGrant {
  type: 'skillProficiency';
  count: number;
  from: SkillType[];
}

export interface WeaponProficiencyGrant {
  type: 'weaponProficiency';
  items: string[];
  choices?: { count: number; from: string[] };
}

export interface ArmorProficiencyGrant {
  type: 'armorProficiency';
  items: string[];
  choices?: { count: number; from: string[] };
}

export interface ToolProficiencyGrant {
  type: 'toolProficiency';
  items: string[];
  choices?: { count: number; from: string[] };
}

export interface SavingThrowProficiencyGrant {
  type: 'savingThrowProficiency';
  abilities: AbilityType[];
}

export interface LanguageGrant {
  type: 'language';
  items: string[];
  choices?: { count: number; from: string[] };
}

/**
 * Защита вида по одному типу урона: к выбранному типу — сопротивление,
 * иммунитет или уязвимость (гибко, в отличие от прежнего «только сопротивление»).
 */
export interface DamageDefenseEntry {
  damageType: DefensibleDamageType;
  kind: import('./damageConstants.js').DamageDefenseKind;
}

export interface DamageDefenseGrant {
  type: 'damageDefense';
  /** Защиты по типам урона (для каждого типа — свой вид защиты). */
  entries: DamageDefenseEntry[];
}

export interface ConditionImmunityGrant {
  type: 'conditionImmunity';
  /** Состояния, к которым вид даёт иммунитет (для хоумбрю-видов). */
  conditions: import('./conditionKeys.js').ConditionKey[];
}

export interface DarkvisionGrant {
  type: 'darkvision';
  range: number;
}

/**
 * Повышение характеристик, выдаваемое видом или подвидом (редакция 2014).
 *
 * В 2014 характеристики поднимает именно вид, а не предыстория: дварф даёт
 * +2 Телосложения, горный дварф сверху +2 Силы, полуэльф — +2 Харизмы и по +1
 * к двум характеристикам на выбор. Поэтому нужны обе формы:
 *
 * - `fixed` — жёсткие прибавки (`{ constitution: 2 }`);
 * - `choice` — `+amount` к `count` характеристикам из набора `from`
 *   (пусто = любая, кроме уже поднятых фиксированно). Выбор делает игрок в
 *   мастере вида.
 *
 * Форма намеренно повторяет {@link FeatAbilityScoreIncrease}: и черта, и вид
 * решают одну задачу, и редакторы у них общие.
 */
export interface SpeciesAbilityGrant {
  fixed?: Partial<Record<AbilityType, number>>;
  choice?: {
    amount: number;
    count: number;
    from?: AbilityType[];
  };
}

export interface SpeciesFeatureChoice {
  key: string;
  name: string;
  description: string;
  /**
   * Повышение характеристик подвида — складывается с повышением основного вида
   * (холмовой дварф: +2 Телосложения от вида и +1 Мудрости от подвида).
   */
  abilityGrant?: SpeciesAbilityGrant;
  /**
   * Особенности, которые даёт этот вариант (подвид) — со своими уровнями,
   * скоростью, тёмным зрением и заклинаниями. Применяются и появляются только
   * при выборе данного варианта. Здесь же — единственное место описания подвида,
   * без дублирования отдельными верхнеуровневыми особенностями.
   */
  features?: SpeciesFeature[];
  /**
   * Защиты от типов урона, которые даёт этот подвид (как у драконорождённых:
   * наследие → сопротивление своему типу урона). Применяются на 1 уровне при
   * выборе варианта, наравне с защитами основного вида (`DamageDefenseGrant`).
   */
  damageDefenses?: DamageDefenseEntry[];
  /** Иммунитеты к состояниям, которые даёт этот подвид. */
  conditionImmunities?: import('./conditionKeys.js').ConditionKey[];
}

/**
 * Заклинание, выдаваемое особенностью вида.
 *
 * Хранит имя (всегда) и опциональную связь с компендиумом по `spellId`.
 * - Со `spellId` — на применении вида ищется в компендиуме по id и авто-выдаётся
 *   (всегда подготовлено). Если компендиума нет — выдача пропускается, ставится
 *   пометка. Переносится между мирами: при отсутствии связи остаётся имя.
 * - Без `spellId` — просто имя (информационно), мастер добавляет заклинание сам.
 */
export interface GrantedSpellRef {
  name: string;
  spellId?: string;
  /**
   * Предпочтённый пак-компендиум, из которого брать заклинание (id манифеста).
   * При применении: есть такой пак — берём из него; нет (у другого мастера) —
   * откат к поиску по `spellId` в любом паке. Локальная подсказка, не ломает
   * переносимость.
   */
  packId?: string;
}

/**
 * Прибавка/установка скорости движения, выдаваемая особенностью вида.
 * Значения трактуются как «не ниже» — итоговая скорость берётся как максимум
 * базовой скорости вида и всех применимых на текущем уровне даров.
 */
export interface SpeciesMovementGrant {
  walk?: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
}

export interface SpeciesFeature {
  key: string;
  name: string;
  description: string;
  /**
   * Уровень персонажа, на котором особенность появляется (по умолчанию 1).
   * Появляется в списке особенностей и применяет свои эффекты, когда суммарный
   * уровень персонажа достигает этого значения.
   */
  level?: number;
  /** Скорость движения, выдаваемая особенностью (полёт, плавание и т.д.). */
  movement?: SpeciesMovementGrant;
  /** Тёмное зрение (футы), выдаваемое особенностью. */
  darkvision?: number;
  choices?: SpeciesFeatureChoice[];
  isInformationalOnly?: boolean;
  /**
   * Заклинания, выдаваемые особенностью. Автор вписывает имя; при совпадении с
   * компендиумом связывает по `spellId` (тогда авто-выдача). Без связи —
   * информационно. См. {@link GrantedSpellRef}.
   */
  grantedSpells?: GrantedSpellRef[];
}

export interface SpeciesDefinition {
  /** Дискриминантное поле типа записи компендиума */
  type: 'species';
  key: SpeciesKey;
  name: string;
  nameEn: string;
  description: string;
  icon?: string;
  /** Ключ источника-книги из sources.json (напр. 'phb', 'dmg') */
  sourceKey?: string;
  /** Принадлежит ли виду к System Reference Document (SRD) */
  isSRD?: boolean;

  creatureType: CreatureType;
  size: CreatureSize[];
  speed: {
    walk: number;
    fly?: number;
    swim?: number;
    climb?: number;
    burrow?: number;
  };

  /**
   * Повышение характеристик вида. В редакции 2014 его даёт вид, а не
   * предыстория; подвид может добавить своё (см. `SpeciesFeatureChoice`).
   */
  abilityGrant?: SpeciesAbilityGrant;

  grants: SpeciesGrant[];

  features: SpeciesFeature[];
}

export interface ActorSpeciesEntry {
  speciesKey: string;
  speciesName: string;
  creatureType: CreatureType;
  size: CreatureSize;
  featureChoices: Record<string, string>;
  grantChoices: Record<number, string[]>;
  /**
   * Итоговые прибавки характеристик, которые вид применил к актору
   * (фиксированные вида и подвида плюс выбранные игроком). Хранятся ИМЕННО
   * применённые значения — чтобы откат при смене вида снимал ровно их, а не
   * пере-выводил из определения, которое могло измениться.
   */
  abilityChoices?: Partial<Record<AbilityType, number>>;
}
