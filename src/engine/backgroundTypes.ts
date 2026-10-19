/**
 * Типы данных предысторий D&D 5e (PHB 2014)
 *
 * Определяет структуру данных предыстории в компендиуме (BackgroundDefinition)
 * и запись на акторе (ActorBackgroundEntry).
 *
 * Отличие от редакции 2024: предыстория НЕ повышает характеристики — в 2014 их
 * поднимают раса и подраса (`featData.abilityScoreIncrease` записи вида).
 */

import type { AbilityType, SkillType, SourceDefinition } from '@vtt/shared';

import type { ActiveEffect } from './activeEffectTypes.js';
import type { FeatData } from './featTypes.js';
import type { StartingEquipmentOption } from './startingEquipment.js';

/** Ключ предыстории (string для поддержки пользовательских предысторий) */
export type BackgroundKey = string;

/** Грант навыков предыстории */
export interface BackgroundSkillGrant {
  /** Навыки, которые даёт предыстория (всегда 2) */
  skills: SkillType[];
}

/** Грант владения инструментами предыстории */
export interface BackgroundToolGrant {
  /** Фиксированные инструменты */
  items: string[];
  /** Выбор из списка (напр. музыкальный инструмент на выбор) */
  choices?: { count: number; from: string[] };
}

/** Грант черты предыстории */
export interface BackgroundFeatGrant {
  /** ID черты в feats.json (фиксированная черта, если нет выбора) */
  featId?: string;
  /** Список ID черт для выбора (если предыстория допускает альтернативы) */
  featChoices?: string[];
  /** Русское название черты (для отображения, когда featId единственный до выбора) */
  featName: string;
  /** Англ. название (для отображения) */
  featNameEn?: string;
  /**
   * Класс, который предыстория называет за игрока: «Мудрец» даёт «Посвящённого в магию
   * (Волшебник)» — список заклинаний задан самой предысторией, и спрашивать его в мастере
   * незачем. Канонический ключ класса (`wizard`) или его название; пусто — класс называет
   * игрок.
   */
  featClassKey?: string;
  /**
   * То же уточнение, как его называет TTG Club (`Background.featSuffix`) — названием
   * класса («Волшебник»). Отдельным полем, потому что записи компендиума пишет выгрузка,
   * а не наша форма: свести их в одно поле значило бы править чужую запись при чтении.
   */
  featSuffix?: string;
}

/**
 * Умение предыстории редакции 2014 («Убежище верующих», «Военное звание»).
 *
 * В 2014 предыстория даёт не черту, а своё умение. Механики у него нет — это
 * текст, который ложится на лист особенностью предыстории.
 */
export interface BackgroundFeature {
  /** Название умения */
  name: string;
  /** Описание умения (может содержать Markdown и HTML) */
  description: string;
}

/**
 * Вариант стартового снаряжения предыстории.
 *
 * Позиции ({@link StartingEquipmentOption.items}) необязательны: без них
 * вариант только показывается строкой, как было до их появления.
 */
export interface BackgroundEquipmentOption extends StartingEquipmentOption {
  /** Стоимость альтернативы в зм (вариант Б) */
  goldAlternative?: number;
}

/** Определение предыстории в компендиуме */
export interface BackgroundDefinition {
  /** Дискриминантное поле типа записи компендиума */
  type: 'background';
  /** Уникальный ключ предыстории */
  key: BackgroundKey;
  /** Русское название */
  name: string;
  /** Английское название */
  nameEn: string;
  /** Описание (может содержать Markdown) */
  description: string;
  /** Ключ источника-книги — аббревиатура в нижнем регистре (напр. 'phb', 'dmg') */
  sourceKey?: string;
  /** Название источника, если его нет ни во встроенном справочнике, ни в паке */
  source?: SourceDefinition;
  /** Принадлежит ли к SRD */
  isSRD?: boolean;
  /**
   * `false` — запись вне SRD скачана без подписки TTG, и источник вырезал её
   * эффекты (остальное на месте). У полных записей поля нет.
   */
  automation?: boolean;

  /** Навыки */
  skillGrant: BackgroundSkillGrant;
  /** Владение инструментами */
  toolGrant: BackgroundToolGrant;
  /** Черта; у предысторий 2014 её нет — пустое название, см. {@link feature} */
  featGrant: BackgroundFeatGrant;
  /** Умение предыстории (редакция 2014), ложится на лист вместо черты */
  feature?: BackgroundFeature;
  /** Варианты стартового снаряжения */
  equipmentOptions: BackgroundEquipmentOption[];

  /**
   * Расширенные «дары что угодно» (как у черты): владения, языки, защиты,
   * иммунитеты, тёмное зрение, повышение характеристик, предусловия, выдаваемые
   * заклинания. Аддитивны к каноническим полям выше; применяются мастером
   * предыстории по образцу применения черты (провенанс `background:<key>`).
   * Хранится в той же колонке `feat_data`, что и у черты. См. {@link FeatData}.
   */
  featData?: FeatData;
  /**
   * Активные эффекты предыстории (бонусы/флаги). Переносятся на актора при
   * применении предыстории (общая для всех предметов колонка `active_effects`).
   */
  activeEffects?: ActiveEffect[];
}

/** Запись о предыстории на акторе */
export interface ActorBackgroundEntry {
  /** Ключ предыстории */
  backgroundKey: string;
  /** Компендиум, из которого взята предыстория; см. {@link ActorClassEntry.packId} */
  packId?: string;
  /** Русское название */
  backgroundName: string;
  /** Навыки, полученные от предыстории */
  skillChoices: SkillType[];
  /** Выбранные инструменты (если был выбор) */
  toolChoices: string[];
  /** ID присвоенной черты либо умения предыстории на акторе (для удаления при замене) */
  grantedFeatId?: string;
  /** Название присвоенной черты (для отображения на листе) */
  grantedFeatName?: string;

  // --- Применённые расширенные дары (`featData`) — для ТОЧНОГО отката ---
  // Хранятся именно применённые значения, а не пере-выводятся из определения
  // (определение могло измениться/удалиться к моменту замены предыстории).
  /** Доп. владения навыками от `featData` (помимо двух канонических навыков). */
  extraSkillProficiencies?: SkillType[];
  /** Владения спасбросками от `featData`. */
  savingThrowProficiencies?: AbilityType[];
  /** Владения доспехами от `featData`. */
  armorProficiencies?: string[];
  /** Владения оружием от `featData`. */
  weaponProficiencies?: string[];
  /** Доп. владения инструментами от `featData` (помимо канонических). */
  extraToolProficiencies?: string[];
  /** Языки от `featData`. */
  languages?: string[];
  /**
   * Синтетическое имя-источник заклинаний, выданных СОБСТВЕННЫМ `featData`
   * предыстории (отличное от имени черты-происхождения) — для снятия на откате.
   */
  ownGrantedSpellSource?: string;
  /** Тёмное зрение, поднятое предысторией (футы) — справочно (не понижается). */
  darkvisionApplied?: number;
}
