/**
 * Некодовая часть папки системы: манифест и справочные данные движка.
 *
 * Живёт отдельно от `scripts/build.mjs`, потому что ровно те же шаги нужны
 * watch-режиму (`scripts/dev.mjs`): правка `system.json` или JSON-справочника
 * обязана доезжать до приложения так же, как правка кода.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { stampHostRequirements } from './hostContract.mjs';

/** Расширения кода — в `data/` не копируются (код уже в бандлах). */
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.map',
]);

/**
 * Проверяет, попадёт ли файл в `dist/data/` (то есть НЕ код).
 *
 * @param filePath - путь или имя файла
 * @returns `true`, если файл считается данными
 */
export function isDataFile(filePath) {
  return !CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Рекурсивно копирует только НЕ-кодовые файлы (данные, ассеты).
 *
 * @param sourceDir - откуда
 * @param targetDir - куда
 * @returns число скопированных файлов
 */
export function copyDataFiles(sourceDir, targetDir) {
  let copied = 0;

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copied += copyDataFiles(sourcePath, targetPath);

      continue;
    }

    if (!isDataFile(entry.name)) {
      continue;
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath);
    copied += 1;
  }

  return copied;
}

/**
 * Кладёт в `dist/` манифест, справочные данные движка и компендиум (если скачан).
 *
 * В манифест вписывается, что бандлы просят у приложения (блок `hostContract`),
 * поэтому вызывать её нужно ПОСЛЕ сборки клиента и сервера — так это и делают
 * и разовая сборка, и watch-режим.
 *
 * @param root - корень репозитория
 * @param dist - папка сборки
 * @returns число скопированных файлов данных
 */
export function copyManifestAndData(root, dist) {
  mkdirSync(dist, { recursive: true });
  cpSync(path.join(root, 'system.json'), path.join(dist, 'system.json'));
  stampHostRequirements(dist);

  // Справочные данные лежат внутри исходников движка.
  const dataSource = path.join(root, 'src', 'engine');

  let copied = existsSync(dataSource)
    ? copyDataFiles(dataSource, path.join(dist, 'data'))
    : 0;

  // Компендиум 2014, скачанный с сайта (`npm run compendium`), — бандл-пак
  // системы: VTTG читает его из `<dataPath>/srd/`.
  const compendiumSource = path.join(root, 'compendium');

  if (existsSync(compendiumSource)) {
    copied += copyDataFiles(compendiumSource, path.join(dist, 'data', 'srd'));
  }

  return copied;
}
