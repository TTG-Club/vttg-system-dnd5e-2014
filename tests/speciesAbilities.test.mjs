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
  '@/core/mimeTypes':
    "export const GAME_ITEM_TRANSFER_MIME = 'application/x-vttg-test';",
};

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/engine/index.ts';
      export { useSpeciesWizard } from './src/client/ui/actor/species/useSpeciesWizard.ts';
      export { buildSpeciesRemovalUpdates } from './src/client/ui/actor/species/speciesRollback.ts';
      export { buildFeatData, featDataToGrants } from './src/client/ui/actor/feat/featEditorTypes.ts';
      export { createPinia, setActivePinia } from 'pinia';
      export { ref } from 'vue';
    `,
    resolveDir: systemRoot,
    sourcefile: 'species-abilities-entry.ts',
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

const bundlePath = join(tmpdir(), `species-abilities-test-${randomUUID()}.mjs`);

await writeFile(bundlePath, bundle.outputFiles[0].text);

const runtime = await import(pathToFileURL(bundlePath).href).finally(() =>
  unlink(bundlePath),
);

beforeEach(() => {
  runtime.setActivePinia(runtime.createPinia());
});

/**
 * Дварф: раса даёт +2 Телосложения. Повышение лежит в блоке даров записи —
 * той же формы, что у черты.
 */
const dwarf = {
  type: 'species',
  key: 'dwarf-phb',
  name: 'Дварф',
  nameEn: 'Dwarf',
  description: '',
  creatureType: 'humanoid',
  size: ['medium'],
  speed: { walk: 25 },
  featData: {
    type: 'feat',
    abilityScoreIncrease: { fixed: { constitution: 2 } },
  },
  features: [],
};

/** Холмовой дварф: подраса сверху даёт +1 Мудрости. */
const hillDwarf = {
  type: 'species',
  key: 'hill-dwarf-phb',
  parentKey: 'dwarf-phb',
  name: 'Холмовой дварф',
  nameEn: 'Hill Dwarf',
  description: '',
  creatureType: 'humanoid',
  size: ['medium'],
  speed: { walk: 25 },
  featData: { type: 'feat', abilityScoreIncrease: { fixed: { wisdom: 1 } } },
  features: [],
};

/** Полуэльф: +2 Харизмы и +1 к двум ДРУГИМ характеристикам на выбор. */
const halfElf = {
  type: 'species',
  key: 'half-elf-phb',
  name: 'Полуэльф',
  nameEn: 'Half-Elf',
  description: '',
  creatureType: 'humanoid',
  size: ['medium'],
  speed: { walk: 30 },
  featData: {
    type: 'feat',
    abilityScoreIncrease: {
      fixed: { charisma: 2 },
      choice: { amount: 1, count: 2 },
    },
  },
  features: [],
};

/** Персонаж первого уровня с валидным состоянием движка. */
function createActor() {
  const actor = structuredClone(runtime.DEFAULT_ACTOR);

  actor.id = 'actor-1';

  return actor;
}

/**
 * Мастер вида на нужной записи.
 *
 * @param {object} definition - вид
 * @param {object | null} subspecies - подвид-запись
 */
function createWizard(definition, subspecies = null) {
  const wizard = runtime.useSpeciesWizard(
    runtime.ref(createActor()),
    runtime.ref(definition),
    runtime.ref([dwarf, hillDwarf, halfElf]),
  );

  wizard.state.value.selectedSize = definition.size[0];
  wizard.state.value.subspeciesKey = subspecies?.key ?? null;

  return wizard;
}

/**
 * Прибавки характеристик из эффекта даров вида, который мастер кладёт на лист.
 *
 * @param {{ rootUpdates: object }} updates - итог мастера
 */
function abilityChanges(updates) {
  const totals = {};

  for (const effect of updates.rootUpdates.activeEffects ?? []) {
    if (!effect.id.startsWith('species-grant:')) {
      continue;
    }

    for (const change of effect.changes) {
      if (change.key.startsWith('ability.')) {
        const ability = change.key.slice('ability.'.length);

        totals[ability] = (totals[ability] ?? 0) + Number(change.value);
      }
    }
  }

  return totals;
}

it('race and subrace increases add up', () => {
  const sources = runtime.collectSpeciesFeatDataSources(
    dwarf,
    1,
    [],
    hillDwarf,
  );

  const increases = runtime.collectSpeciesAbilityIncreases(sources);

  assert.deepEqual(runtime.sumSpeciesAbilityIncreases(increases, {}), {
    constitution: 2,
    wisdom: 1,
  });

  assert.ok(runtime.areSpeciesAbilityChoicesComplete(increases, {}));
});

it('choice without a list offers every ability except the fixed ones', () => {
  const [increase] = runtime.collectSpeciesAbilityIncreases(
    runtime.collectSpeciesFeatDataSources(halfElf, 1, []),
  );

  assert.deepEqual(increase.choice.from, [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
  ]);

  assert.equal(increase.choice.count, 2);
});

it('wizard applies fixed race and subrace increases without asking', () => {
  const wizard = createWizard(dwarf, hillDwarf);

  assert.ok(wizard.steps.value.some((step) => step.key === 'abilities'));

  wizard.currentStepIndex.value = wizard.steps.value.findIndex(
    (step) => step.key === 'abilities',
  );

  assert.equal(wizard.canProceed.value, true);

  assert.deepEqual(abilityChanges(wizard.buildUpdates(null, [], null)), {
    constitution: 2,
    wisdom: 1,
  });
});

it('wizard waits for the half-elf choice and applies it', () => {
  const wizard = createWizard(halfElf);

  wizard.currentStepIndex.value = wizard.steps.value.findIndex(
    (step) => step.key === 'abilities',
  );

  assert.equal(wizard.canProceed.value, false);

  wizard.state.value.featDataChoices = {
    [halfElf.key]: { [runtime.ABILITY_INCREASE_CHOICE_KEY]: ['dexterity'] },
  };

  assert.equal(wizard.canProceed.value, false);

  wizard.state.value.featDataChoices = {
    [halfElf.key]: {
      [runtime.ABILITY_INCREASE_CHOICE_KEY]: ['dexterity', 'constitution'],
    },
  };

  assert.equal(wizard.canProceed.value, true);

  assert.deepEqual(abilityChanges(wizard.buildUpdates(null, [], null)), {
    charisma: 2,
    dexterity: 1,
    constitution: 1,
  });
});

it('race without increases has no abilities step', () => {
  const wizard = createWizard({ ...halfElf, featData: undefined });

  assert.ok(wizard.steps.value.every((step) => step.key !== 'abilities'));
});

it('background no longer carries an ability grant', () => {
  const normalized = runtime.normalizeBackgroundDefinition({
    type: 'background',
    key: 'acolyte',
    name: 'Прислужник',
    nameEn: 'Acolyte',
    description: '',
  });

  assert.equal('abilityGrant' in normalized, false);
});
