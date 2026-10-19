import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeEach, it } from 'vitest';

import { hostSharedEntry, systemRoot } from './helpers/engineBundle.mjs';

const require = createRequire(join(systemRoot, 'package.json'));
const { build } = require('esbuild');

/**
 * Порты хоста, до которых дотягиваются мастер вида, откат и редактор черты.
 * Компендиум и мир этим проверкам не нужны: ресурсы считаются без них.
 */
/**
 * Ключ заглушки нашего же модуля компендиума заклинаний. Импортируют его по
 * относительному пути, поэтому в карте он лежит под отдельным именем, а не под
 * своим адресом: подставляет его правило резолва ниже.
 */
const SPELL_COMPENDIUM_STUB = 'stub:spellCompendium';
/** Выдача заклинаний листу: окно выбора компендиума этим проверкам не нужно. */
const SPELL_GRANTS_STUB = 'stub:grantedSpellPacks';

const HOST_STUBS = {
  '@/core/entityUtils':
    'let issued = 0; export const generateEntityId = (prefix) => prefix + "-" + ++issued;',
  '@/stores/itemsStore':
    'export const useItemsStore = () => ({ itemsByType: () => [] });',
  [SPELL_COMPENDIUM_STUB]:
    'export const extractWorldSpells = () => []; export const loadSpellPacks = async () => ({ packs: [] });',
  [SPELL_GRANTS_STUB]:
    'export const resolveSpellGrantsForActor = async () => [];',
  '@/core/compendiumDataClient':
    'export const loadCompendiumKindByPack = async () => []; export const loadCompendiumKind = async () => [];',
  '@/core/mimeTypes':
    "export const GAME_ITEM_TRANSFER_MIME = 'application/x-vttg-test';",
};

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/engine/index.ts';
      export { useBackgroundWizard } from './src/client/ui/actor/background/useBackgroundWizard.ts';
      export { createPinia, setActivePinia } from 'pinia';
      export { ref } from 'vue';
    `,
    resolveDir: systemRoot,
    sourcefile: 'background-feature-entry.ts',
    loader: 'ts',
  },
  plugins: [
    {
      name: 'host-stubs',
      setup(builder) {
        builder.onResolve({ filter: /^@\// }, (request) => ({
          path: request.path,
          namespace: 'host-api',
        }));

        // Компендиум заклинаний — наш модуль, но для этих проверок он такой же
        // внешний мир, как и порты хоста: ресурсы вида считаются без него.
        builder.onResolve({ filter: /composables\/spellCompendium$/ }, () => ({
          path: SPELL_COMPENDIUM_STUB,
          namespace: 'host-api',
        }));

        // Выдача заклинаний листу — тоже наш модуль, но тянет окно выбора
        // компендиума и уведомления хоста: ресурсам вида они не нужны.
        builder.onResolve(
          { filter: /composables\/grantedSpellPacks$/ },
          () => ({
            path: SPELL_GRANTS_STUB,
            namespace: 'host-api',
          }),
        );

        builder.onLoad({ filter: /.*/, namespace: 'host-api' }, (request) => {
          if (!(request.path in HOST_STUBS)) {
            throw new Error(`Неожиданный импорт: ${request.path}`);
          }

          return { contents: HOST_STUBS[request.path], resolveDir: systemRoot };
        });
      },
    },
  ],
  alias: {
    '@vtt/shared/system/dnd.js': join(systemRoot, 'src/engine/index.ts'),
    '@vtt/shared': hostSharedEntry,
    'vue': require.resolve('vue/dist/vue.runtime.esm-bundler.js'),
    'pinia': join(systemRoot, 'node_modules/pinia/dist/pinia.mjs'),
  },
  define: {
    'process.env.NODE_ENV': '"test"',
    '__VUE_OPTIONS_API__': 'true',
    '__VUE_PROD_DEVTOOLS__': 'false',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
});

const bundlePath = join(
  tmpdir(),
  `background-feature-test-${randomUUID()}.mjs`,
);

await writeFile(bundlePath, bundle.outputFiles[0].text);

const runtime = await import(pathToFileURL(bundlePath).href).finally(() =>
  unlink(bundlePath),
);

beforeEach(() => {
  runtime.setActivePinia(runtime.createPinia());
});

/**
 * Прислужник редакции 2014: черты и характеристик нет, вместо черты — умение
 * предыстории, как его отдаёт выгрузка старого сайта.
 */
const acolyte = {
  type: 'background',
  key: 'acolyte',
  name: 'Прислужник',
  nameEn: 'Acolyte',
  description: '',
  sourceKey: 'phb',
  skillGrant: { skills: ['insight', 'religion'] },
  toolGrant: { items: [] },
  equipmentOptions: [],
  feature: {
    name: 'Приют для верующих',
    description: '<p>Вас примут в храме.</p>',
  },
};

/** Предыстория без черты и без умения — например, своя из панели «Предметы». */
const bare = {
  ...acolyte,
  key: 'bare',
  name: 'Пустая',
  feature: undefined,
};

/** Персонаж первого уровня с валидным состоянием движка. */
function createActor() {
  const actor = structuredClone(runtime.DEFAULT_ACTOR);

  actor.id = 'actor-1';

  return actor;
}

/**
 * Применяет предысторию к персонажу и возвращает обновления листа.
 *
 * @param {object} definition - предыстория
 * @param {object} actor - персонаж
 */
function apply(definition, actor = createActor()) {
  const wizard = runtime.useBackgroundWizard(
    runtime.ref(definition),
    runtime.ref(actor),
    runtime.ref(true),
    runtime.ref(null),
    runtime.ref(undefined),
  );

  return wizard.buildUpdates([]);
}

it('умение предыстории 2014 ложится на лист особенностью предыстории', () => {
  const { systemUpdates, rootUpdates } = apply(acolyte);

  const feature = rootUpdates.features.find(
    (entry) => entry.name === 'Приют для верующих',
  );

  assert.ok(feature, 'умение не легло на лист');
  assert.equal(feature.featureType, 'background');
  assert.equal(feature.description, '<p>Вас примут в храме.</p>');
  assert.equal(systemUpdates.background.grantedFeatId, feature.id);
  assert.equal(systemUpdates.background.grantedFeatName, 'Приют для верующих');

  assert.equal(
    rootUpdates.features.filter((entry) => entry.featureType === 'feat').length,
    0,
    'черты у предыстории 2014 быть не должно',
  );
});

it('смена предыстории снимает умение прежней', () => {
  const first = apply(acolyte);
  const actor = createActor();

  actor.system = { ...actor.system, ...first.systemUpdates };
  actor.features = first.rootUpdates.features;

  const second = apply(bare, actor);

  assert.equal(
    second.rootUpdates.features.some(
      (entry) => entry.name === 'Приют для верующих',
    ),
    false,
  );
});

it('предыстория без черты и умения ничего не кладёт на лист', () => {
  const { systemUpdates, rootUpdates } = apply(bare);

  assert.deepEqual(rootUpdates.features, []);
  assert.equal(systemUpdates.background.grantedFeatId, undefined);
  assert.equal(systemUpdates.background.grantedFeatName, undefined);
});
