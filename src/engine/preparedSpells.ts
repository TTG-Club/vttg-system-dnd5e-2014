/**
 * Пределы подготовки заклинаний и заговоров D&D 5e (PHB 2014).
 *
 * Число берётся из таблицы класса компендиума на уровне персонажа в этом классе
 * (у мультикласса — сумма по всем классам), а лист даёт его поправить: задать
 * своё число вместо расчёта или прибавить свои бонусы (черта, предмет,
 * домашнее правило). Поправки листа считает `preparedLimit`: этот модуль
 * остаётся без зависимостей, потому что его настройку по умолчанию читает
 * `consts`, а свои бонусы сами тянут `consts` — через них вышел бы круг.
 *
 * @module system/dnd/preparedSpells
 */

import type { AbilityType } from '@vtt/shared';

import type { ActorClassEntry, ClassDefinition } from './classTypes.js';
import type { Spell } from './dndEntities.js';
import type { DnDPreparedLimit } from './types.js';

import { CANTRIP_SPELL_LEVEL } from './spellTypes.js';

/** Поля заклинания, от которых зависит его подготовка */
type SpellPreparationFields = Pick<
  Spell,
  | 'level'
  | 'prepared'
  | 'alwaysPrepared'
  | 'grantedByFeature'
  | 'grantKind'
  | 'borrowedPreparation'
>;

/**
 * Держит ли запись отметку «Подготавливать не нужно» от чужой выдачи: вид выдал
 * заговор, уже отмеченный в книге. У заклинаний 1+ круга хватает самой отметки,
 * а заговор книги без этой проверки считался бы обычным — отметку заговорам
 * раньше давал только их собственный источник.
 *
 * @param spell - заклинание листа
 * @returns true — запись подготовлена всегда и места не занимает
 */
function hasBorrowedPreparation(spell: SpellPreparationFields): boolean {
  return Boolean(spell.alwaysPrepared && spell.borrowedPreparation);
}

/**
 * Выдано ли заклинание записью — умением, видом, предысторией, чертой, — а не
 * взято игроком в книгу.
 *
 * @param spell - заклинание листа
 * @returns true — заклинание уходит вместе со своим источником
 */
export function isGrantedSpell(
  spell: Pick<Spell, 'grantedByFeature'>,
): boolean {
  return Boolean(spell.grantedByFeature);
}

/**
 * Идёт ли выданное заклинание в счёт колонок таблицы класса. Колонки говорят о
 * заклинаниях самого класса, поэтому выданное видом, предысторией или чертой в
 * счёт не идёт: иначе «Посвящённый в магию» съедал бы заговоры колдуна.
 *
 * Выданное до появления `grantKind` считается как прежде — по отметке
 * подготовки: без неё оно шло в счёт, с ней — нет.
 *
 * @param spell - выданное заклинание
 * @returns true — заклинание выдано умением класса
 */
function isClassGrant(spell: SpellPreparationFields): boolean {
  return spell.grantKind === undefined || spell.grantKind === 'class';
}

/**
 * Можно ли игроку снять и поставить подготовку. Заговор книги отмечается так же,
 * как заклинание: игрок держит в книге весь список заговоров и отмечает свои.
 * Выданный заговор и заклинание, которое готовить не нужно, подготовлены всегда.
 *
 * @param spell - заклинание листа
 * @returns true — значок подготовки переключается
 */
export function canTogglePrepared(spell: SpellPreparationFields): boolean {
  if (spell.level === CANTRIP_SPELL_LEVEL) {
    return !isGrantedSpell(spell) && !hasBorrowedPreparation(spell);
  }

  return !spell.alwaysPrepared;
}

/**
 * Проверяет доступность заклинания без изменения подготовки. Выданный заговор
 * доступен всегда, заговор книги — если отмечен, заклинание старшего круга —
 * после подготовки либо по дару.
 *
 * Лист, чьи заговоры книги ещё не разобраны по отметкам (`cantripsTracked` у
 * актора не взведён), держит их доступными все: раньше подготовки у заговоров
 * не было, и прежняя отметка `false` ничего не значила.
 *
 * @param spell - заклинание из книги персонажа
 * @param cantripsTracked - заговоры книги у актора уже отмечаются
 * @returns true — заклинание можно накладывать без подготовки
 */
export function isSpellReady(
  spell: SpellPreparationFields,
  cantripsTracked = true,
): boolean {
  if (spell.level === CANTRIP_SPELL_LEVEL) {
    return isGrantedSpell(spell) || !cantripsTracked || spell.prepared === true;
  }

  return Boolean(spell.prepared) || Boolean(spell.alwaysPrepared);
}

/**
 * Занимает ли заговор место в плитке «Заговоры»: отмеченный заговор книги и
 * заговор, выданный умением класса (три заговора жреца с 1 уровня). Выданный с
 * отметкой «Подготавливать не нужно» («Чудотворец»), видом, предысторией или
 * чертой — сверх колонки таблицы класса.
 *
 * @param spell - заклинание листа
 * @param cantripsTracked - заговоры книги у актора уже отмечаются
 * @returns true — заговор идёт в счёт
 */
export function countsTowardCantrips(
  spell: SpellPreparationFields,
  cantripsTracked = true,
): boolean {
  if (spell.level !== CANTRIP_SPELL_LEVEL || hasBorrowedPreparation(spell)) {
    return false;
  }

  if (!isGrantedSpell(spell)) {
    return !cantripsTracked || spell.prepared === true;
  }

  return isClassGrant(spell) && !spell.alwaysPrepared;
}

/**
 * Занимает ли заклинание 1+ круга место среди подготовленных: подготовленное
 * заклинание книги и выданное умением класса, которое готовит сам игрок
 * («весь список класса»). Выданное видом, предысторией или чертой места не
 * занимает, как и заклинание домена.
 *
 * @param spell - заклинание листа
 * @returns true — заклинание идёт в счёт подготовленных
 */
export function countsTowardPreparedSpells(
  spell: SpellPreparationFields,
): boolean {
  if (spell.level === CANTRIP_SPELL_LEVEL || !spell.prepared) {
    return false;
  }

  if (spell.alwaysPrepared) {
    return false;
  }

  return !isGrantedSpell(spell) || isClassGrant(spell);
}

/**
 * Отмечает заговоры книги, у которых отметки ещё нет, пока в колонке
 * «Заговоры» остаётся место: так новый заговор сразу занимает свободное место,
 * а у старых листов оживают прежние заговоры. Отмеченные остаются как есть, и
 * лишний заговор сверх места остаётся неотмеченным — его выбирает игрок.
 *
 * @param spells - заклинания листа
 * @param limit - число заговоров по таблице класса; null — предела нет
 * @param isUnmarked - у заговора нет отметки (у старых листов — любой без `true`)
 * @returns новый список заклинаний (исходный не мутируется)
 */
export function settleBookCantrips(
  spells: Spell[],
  limit: number | null,
  isUnmarked: (spell: Spell) => boolean,
): Spell[] {
  let count = spells.filter((spell) => countsTowardCantrips(spell)).length;

  return spells.map((spell) => {
    if (
      spell.level !== CANTRIP_SPELL_LEVEL
      || isGrantedSpell(spell)
      || spell.prepared === true
      || !isUnmarked(spell)
    ) {
      return spell;
    }

    const prepared = limit === null || count < limit;

    if (prepared) {
      count += 1;
    }

    return { ...spell, prepared };
  });
}

/** Вид подготовки: заклинания книги либо заговоры (свой счётчик) */
export type PreparedKind = 'spells' | 'cantrips';

/** Минимальное число подготовленных */
export const PREPARED_LIMIT_MIN = 0;

/** Максимальное число подготовленных */
export const PREPARED_LIMIT_MAX = 99;

/** Предел неизвестен: таблица класса такой колонки не даёт */
export const PREPARED_LIMIT_EMPTY_VALUE = '—';

/** Настройка предела по умолчанию: всё считается по таблице класса */
export const DEFAULT_PREPARED_LIMIT: DnDPreparedLimit = {
  custom: null,
  bonuses: [],
};

/**
 * Известные ключи колонок таблицы класса по виду подготовки.
 *
 * Их несколько, потому что паки писались разными способами: у SRD-классов ключ
 * английский и осмысленный (`cantripsKnown`), а у паков TTG Club он получается
 * транслитерацией русской подписи колонки (`zagovory`, `podg-zakl`).
 */
const PREPARED_COLUMN_KEYS: Record<PreparedKind, string[]> = {
  spells: ['preparedSpells', 'podg-zakl', 'spellsKnown'],
  cantrips: ['cantripsKnown', 'knownCantrips', 'zagovory', 'zag'],
};

/**
 * Приводит подпись колонки к виду для сравнения: паки пишут её как придётся —
 * «Заговоры», «Заг.», «Подг. Закл.», «Подг. закл», — и различаются они только
 * регистром и точками.
 *
 * @param label - подпись колонки
 * @returns подпись в нижнем регистре без пробелов по краям
 */
function normalizeColumnLabel(label: string): string {
  return label.trim().toLowerCase().replace(/ё/g, 'е');
}

/**
 * Подходит ли колонка под нужный вид подготовки по своей подписи. Ключ у таких
 * колонок непредсказуем (транслитерация), а подпись человек пишет узнаваемо.
 *
 * @param label - подпись колонки
 * @param kind - вид подготовки
 * @returns true, если колонка про этот вид подготовки
 */
function matchesColumnLabel(label: string, kind: PreparedKind): boolean {
  const normalized = normalizeColumnLabel(label);

  if (kind === 'cantrips') {
    return normalized.startsWith('заговор') || normalized.startsWith('заг.');
  }

  // Классы 2014, которые заклинания не готовят, а знают (бард, чародей,
  // колдун, следопыт), задают предел колонкой «Известные заклинания».
  return (
    normalized.startsWith('подг')
    || (normalized.includes('известн') && normalized.includes('заклин'))
  );
}

/**
 * Ключи, под которыми в строках таблицы этого класса может лежать нужное число:
 * известные ключи плюс те, что объявлены в колонках самого класса.
 *
 * @param definition - определение класса
 * @param kind - вид подготовки
 * @returns ключи для поиска в строке таблицы
 */
function resolveColumnKeys(
  definition: ClassDefinition,
  kind: PreparedKind,
): string[] {
  const keys = [...PREPARED_COLUMN_KEYS[kind]];

  for (const column of definition.tableColumns ?? []) {
    if (column.key && matchesColumnLabel(column.label, kind)) {
      keys.push(column.key);
    }
  }

  return keys;
}

/**
 * Число из ячейки таблицы. Паки пишут значения строками («3»), а прочерк
 * означает «в этой строке значения нет».
 *
 * @param value - значение ячейки
 * @returns число или null
 */
function parseCellNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed === '—' || trimmed === '-') {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

/** С какого уровня класса половинный заклинатель готовит заклинания (PHB 2014) */
const HALF_CASTER_START_LEVEL = 2;

/** Меньше одного заклинания формула подготовки не даёт (PHB 2014) */
const MIN_FALLBACK_PREPARED = 1;

/**
 * Запасной расчёт подготовленных заклинаний по формуле PHB 2014 — для класса,
 * чья таблица колонки подготовки не содержит (жрец, друид, волшебник, паладин:
 * в книге 2014 у них не колонка, а формула).
 *
 * Полный заклинатель готовит модификатор своей характеристики плюс уровень
 * класса, половинный — модификатор плюс половину уровня с округлением вниз и
 * только со 2 уровня. Меньше одного заклинания не бывает.
 *
 * @param entry - класс листа
 * @param abilityMods - модификаторы характеристик листа; нет — считаются нулём
 * @returns число подготовленных или null, если формула к классу не относится
 */
function getFallbackPreparedValue(
  entry: ActorClassEntry,
  abilityMods: Partial<Record<AbilityType, number>> | undefined,
): number | null {
  if (!entry.spellcastingAbility) {
    return null;
  }

  const modifier = abilityMods?.[entry.spellcastingAbility] ?? 0;

  if (entry.casterType === 'full') {
    return Math.max(MIN_FALLBACK_PREPARED, modifier + entry.level);
  }

  if (entry.casterType === 'half' && entry.level >= HALF_CASTER_START_LEVEL) {
    return Math.max(
      MIN_FALLBACK_PREPARED,
      modifier + Math.floor(entry.level / 2),
    );
  }

  return null;
}

/**
 * Число из таблицы класса на нужном уровне.
 *
 * Ячейку ищем не только в строке уровня, но и в строках ниже: паки заполняют её
 * лишь там, где число МЕНЯЕТСЯ (у волшебника заговоры стоят на 1, 4 и 10 уровне,
 * а между ними пусто), и на 2 уровне действует значение с первого.
 *
 * @param definition - определение класса из компендиума
 * @param level - уровень персонажа в этом классе
 * @param kind - вид подготовки
 * @returns число из таблицы или null, если колонки нет
 */
function getLevelTableValue(
  definition: ClassDefinition,
  level: number,
  kind: PreparedKind,
): number | null {
  const columnKeys = resolveColumnKeys(definition, kind);

  // Строки ниже нужного уровня по убыванию: первая заполненная и есть текущее
  // значение колонки.
  const rows = (definition.levelTable ?? [])
    .filter((entry) => entry.level <= level)
    .sort((first, second) => second.level - first.level);

  for (const row of rows) {
    for (const columnKey of columnKeys) {
      const value = parseCellNumber(row[columnKey]);

      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

/**
 * Число подготовленных по таблицам классов актёра.
 *
 * У мультикласса каждый класс готовит по своей таблице и своему уровню в ней,
 * поэтому числа складываются. Классы без нужной колонки в сумму не входят —
 * иначе плитка показала бы число, которого таблицы не дают.
 *
 * Определение класса находит вызывающий: у записи актора есть не только ключ,
 * но и пак, и таблицу надо читать из той копии класса, которую выбрали, а не из
 * одноимённой в соседнем компендиуме.
 *
 * @param classes - классы актёра
 * @param resolveDefinition - определение класса по записи актора; undefined —
 *   записи нет ни в одном компендиуме
 * @param kind - вид подготовки
 * @param abilityMods - модификаторы характеристик листа для формулы PHB 2014;
 *   нет — модификатор считается нулём
 * @returns число из таблиц или null, если его не даёт ни один класс
 */
export function getClassPreparedValue(
  classes: ActorClassEntry[],
  resolveDefinition: (entry: ActorClassEntry) => ClassDefinition | undefined,
  kind: PreparedKind,
  abilityMods?: Partial<Record<AbilityType, number>>,
): number | null {
  let total: number | null = null;

  for (const entry of classes) {
    const definition = resolveDefinition(entry);

    const tableValue = definition
      ? getLevelTableValue(definition, entry.level, kind)
      : null;

    if (tableValue !== null) {
      total = (total ?? 0) + tableValue;

      continue;
    }

    // Запасной расчёт — только для заклинаний книги: у заговоров число в
    // каждом классе своё, общей формулы, из которой его можно было бы вывести,
    // в книге нет.
    const fallbackValue =
      kind === 'spells' ? getFallbackPreparedValue(entry, abilityMods) : null;

    if (fallbackValue !== null) {
      total = (total ?? 0) + fallbackValue;
    }
  }

  return total;
}
