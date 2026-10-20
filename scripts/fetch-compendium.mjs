/**
 * Скачивает компендиум редакции 2014 со старого сайта TTG Club и раскладывает его
 * бандл-паком системы.
 *
 * Компендиум едет ВНУТРИ системы: VTTG читает пак из `<папка системы>/<dataPath>/srd/`
 * (см. `docs/CONTENT_AUTHORING.md` хоста, раздел 4.1), поэтому приложению не нужно
 * знать ни про старый сайт, ни про редакцию 2014. Скрипт кладёт пак в `compendium/`
 * корня репозитория, а сборка (`scripts/lib/distAssets.mjs`) копирует его в
 * `dist/data/srd/`.
 *
 * Сайт отдаёт весь компендиум одним ответом `GET /api/v2/vttg/changes`: записи
 * `{ type, url, data }`, дерево разделов и словарь источников. Раскладка повторяет
 * ту, что VTTG пишет для скачиваемых паков: папка раздела — поле `section` записи
 * (или её `type`), файл — `<id>.json`, у каждого листа дерева — `section.json`.
 *
 * Использование:
 *
 *   npm run compendium
 *   COMPENDIUM_ORIGIN=https://dev.ttg.club npm run compendium   # другой адрес сайта
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Куда кладётся пак; сборка копирует его в `dist/data/srd/`. */
const COMPENDIUM_DIR = path.join(ROOT, 'compendium');

/** Адрес старого сайта, отдающего компендиум 2014. */
const ORIGIN = process.env.COMPENDIUM_ORIGIN ?? 'https://ttg.club';

/** Ручка выгрузки: без курсора сайт отдаёт компендиум целиком. */
const CHANGES_PATH = '/api/v2/vttg/changes';

/** Полная выгрузка большая — ждём её дольше обычного запроса. */
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

/** Идентичность пака в компендиуме VTTG. */
const PACK_ID = 'ttg-dnd5e-2014';
const PACK_NAME = 'TTG Club 2014';

const PACK_MANIFEST_FILE = 'manifest.json';
const SECTION_MANIFEST_FILE = 'section.json';
const DEFAULT_SECTION_ICON = 'tabler:cards';

/**
 * Завершает работу с сообщением об ошибке.
 *
 * @param message - что пошло не так
 */
function fail(message) {
  console.error(`\n[compendium] ${message}\n`);
  process.exit(1);
}

/**
 * Делает идентификатор безопасным именем файла или папки (как VTTG).
 *
 * @param value - исходный идентификатор
 * @returns безопасный сегмент пути
 */
function sanitizePathSegment(value) {
  return value.replace(/[^\w-]/g, '_');
}

/**
 * Записывает значение в JSON-файл, создавая родительские папки.
 *
 * @param filePath - абсолютный путь к файлу
 * @param data - сериализуемое значение
 */
function writeJsonFile(filePath, data) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

/**
 * Проверяет, что значение — непустая строка.
 *
 * @param value - произвольное значение
 * @returns `true` для непустой строки
 */
function isFilledString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Скачивает полную выгрузку компендиума с сайта.
 *
 * @returns разобранный ответ `/changes`
 */
async function fetchChanges() {
  const url = `${ORIGIN}${CHANGES_PATH}`;

  let response;

  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    fail(
      `${url} не ответил: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (!response.ok) {
    fail(`${url} ответил статусом ${response.status}`);
  }

  const body = await response.json();

  if (
    typeof body !== 'object'
    || body === null
    || !Array.isArray(body.upserts)
  ) {
    fail(`${url} вернул ответ без списка записей (upserts)`);
  }

  return body;
}

/**
 * Определяет тип записей папки раздела по первой записи (как VTTG).
 *
 * @param sectionDir - абсолютный путь к папке раздела
 * @returns тип записей или `undefined`
 */
function detectSectionDataKind(sectionDir) {
  const fileNames = readdirSync(sectionDir)
    .filter((name) => name.endsWith('.json') && name !== SECTION_MANIFEST_FILE)
    .sort((first, second) => first.localeCompare(second));

  for (const fileName of fileNames) {
    const entry = JSON.parse(
      readFileSync(path.join(sectionDir, fileName), 'utf-8'),
    );

    if (isFilledString(entry?.type) && entry.type !== 'separator') {
      return entry.type;
    }
  }

  return undefined;
}

/**
 * Пишет `section.json` листа.
 *
 * @param folder - папка раздела внутри пака
 * @param section - отображение раздела
 */
function writeSection(folder, section) {
  writeJsonFile(path.join(COMPENDIUM_DIR, folder, SECTION_MANIFEST_FILE), {
    id: folder,
    ...section,
    dataKind:
      section.dataKind
      ?? detectSectionDataKind(path.join(COMPENDIUM_DIR, folder))
      ?? folder,
  });
}

/**
 * Превращает узел дерева разделов из ответа сайта в ссылку манифеста пака.
 * Листы без данных и опустевшие группы отбрасываются.
 *
 * @param node - узел дерева из ответа сайта
 * @param onDisk - папки разделов, в которых есть записи
 * @param used - папки, уже занятые деревом
 * @returns ссылка манифеста (имя папки или группа) либо `null`
 */
function resolveSectionNode(node, onDisk, used) {
  if (Array.isArray(node.children) && node.children.length > 0) {
    const children = node.children
      .map((child) => resolveSectionNode(child, onDisk, used))
      .filter((ref) => ref !== null);

    if (children.length === 0) {
      return null;
    }

    return {
      id: node.group ?? node.section ?? sanitizePathSegment(node.name),
      name: node.name,
      icon: node.icon,
      children,
    };
  }

  const folder = node.section;

  if (!isFilledString(folder) || !onDisk.has(folder)) {
    return null;
  }

  used.add(folder);

  writeSection(folder, {
    name: node.name,
    icon: node.icon,
    dataKind: node.dataKind,
    view: node.view,
  });

  return folder;
}

const changes = await fetchChanges();

rmSync(COMPENDIUM_DIR, { recursive: true, force: true });

const counts = new Map();

for (const change of changes.upserts) {
  const data = change?.data;

  if (!isFilledString(data?.id) || !isFilledString(data?.type)) {
    continue;
  }

  const folder = sanitizePathSegment(data.section ?? data.type);

  writeJsonFile(
    path.join(COMPENDIUM_DIR, folder, `${sanitizePathSegment(data.id)}.json`),
    data,
  );

  counts.set(folder, (counts.get(folder) ?? 0) + 1);
}

if (counts.size === 0) {
  fail(`сайт ${ORIGIN} не вернул ни одной записи компендиума`);
}

const onDisk = new Set(counts.keys());
const used = new Set();
const sections = [];

for (const node of changes.sections ?? []) {
  const ref = resolveSectionNode(node, onDisk, used);

  if (ref !== null) {
    sections.push(ref);
  }
}

// Папки, которых нет в дереве сайта, — плоско в конце.
for (const folder of [...onDisk].sort((first, second) =>
  first.localeCompare(second),
)) {
  if (used.has(folder)) {
    continue;
  }

  writeSection(folder, { name: folder, icon: DEFAULT_SECTION_ICON });
  sections.push(folder);
}

writeJsonFile(path.join(COMPENDIUM_DIR, PACK_MANIFEST_FILE), {
  id: PACK_ID,
  name: PACK_NAME,
  readOnly: true,
  syncedUntil: changes.until,
  sections,
  sources: changes.sources ?? [],
});

const summary = [...counts]
  .map(([folder, count]) => `${folder} ${count}`)
  .join(', ');

console.log(`[compendium] ${ORIGIN}: ${summary}`);
