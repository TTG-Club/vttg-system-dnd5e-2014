<script setup lang="ts">
  import type { AbilityType } from '@vtt/shared';
  import type {
    DnDAbilityScores,
    SpeciesAbilityIncrease,
    SpeciesAbilityIncreaseChoice,
  } from '@vtt/shared/system/dnd.js';

  import type { SpeciesWizardState } from './useSpeciesWizard';

  import { computed } from 'vue';

  import {
    ABILITY_LABELS,
    ABILITY_OPTIONS,
    isAbilityType,
    sumSpeciesAbilityIncreases,
  } from '@vtt/shared/system/dnd.js';

  import { SPECIES_WIZARD_LABELS, WIZARD_ASI_LABELS } from '../constants';

  const props = defineProps<{
    /** Повышения характеристик расы, подрасы и особенностей */
    increases: SpeciesAbilityIncrease[];
    state: SpeciesWizardState;
    currentAbilities: DnDAbilityScores;
  }>();

  const emit = defineEmits<{
    'update:state': [value: SpeciesWizardState];
  }>();

  /** Итоговые прибавки: фиксированные плюс уже выбранные */
  const totals = computed(() =>
    sumSpeciesAbilityIncreases(props.increases, props.state.featDataChoices),
  );

  /**
   * Фиксированные прибавки источника одной строкой: «+2 Телосложение».
   *
   * @param increase - повышение источника
   */
  function formatFixed(increase: SpeciesAbilityIncrease): string {
    return Object.entries(increase.fixed)
      .map(([ability, bonus]) => {
        const label = isAbilityType(ability)
          ? ABILITY_LABELS[ability]
          : ability;

        return `+${bonus} ${label}`;
      })
      .join(', ');
  }

  /**
   * Выбранные характеристики группы.
   *
   * @param increase - повышение источника с выбором
   * @param choice - выбор прибавки
   */
  function chosenAbilities(
    increase: SpeciesAbilityIncrease,
    choice: SpeciesAbilityIncreaseChoice,
  ): string[] {
    return props.state.featDataChoices[increase.sourceKey]?.[choice.key] ?? [];
  }

  /**
   * Отмечает или снимает характеристику в группе выбора. Сверх положенного
   * числа отметить нельзя — сначала снимите одну из выбранных.
   *
   * @param increase - повышение источника с выбором
   * @param choice - выбор прибавки
   * @param ability - характеристика
   */
  function toggleAbility(
    increase: SpeciesAbilityIncrease,
    choice: SpeciesAbilityIncreaseChoice,
    ability: AbilityType,
  ): void {
    const chosen = chosenAbilities(increase, choice);

    let next: string[];

    if (chosen.includes(ability)) {
      next = chosen.filter((value) => value !== ability);
    } else if (chosen.length < choice.count) {
      next = [...chosen, ability];
    } else {
      return;
    }

    emit('update:state', {
      ...props.state,
      featDataChoices: {
        ...props.state.featDataChoices,
        [increase.sourceKey]: {
          ...props.state.featDataChoices[increase.sourceKey],
          [choice.key]: next,
        },
      },
    });
  }
</script>

<template>
  <div class="space-y-3">
    <span class="mb-2 block text-sm font-medium text-toned">
      {{ WIZARD_ASI_LABELS.title }}
    </span>

    <p class="text-sm text-muted">
      {{ SPECIES_WIZARD_LABELS.abilitiesHint }}
    </p>

    <div
      v-for="increase in increases"
      :key="increase.sourceKey"
      class="space-y-2 rounded-md border border-default/50 bg-elevated/30 px-3 py-2"
    >
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-sm font-medium text-highlighted">
          {{ increase.sourceName }}
        </span>

        <span
          v-if="Object.keys(increase.fixed).length > 0"
          class="text-sm font-bold text-healing"
        >
          {{ formatFixed(increase) }}
        </span>
      </div>

      <template v-if="increase.choice">
        <div class="flex items-center justify-between">
          <span class="text-sm text-muted">
            {{ SPECIES_WIZARD_LABELS.abilitiesChoicePrefix }}+{{
              increase.choice.amount
            }}
          </span>

          <span
            class="text-sm font-bold"
            :class="
              chosenAbilities(increase, increase.choice).length
              < increase.choice.count
                ? 'text-warning'
                : 'text-healing'
            "
          >
            {{ SPECIES_WIZARD_LABELS.abilitiesChosenPrefix
            }}{{ chosenAbilities(increase, increase.choice).length
            }}{{ SPECIES_WIZARD_LABELS.abilitiesChosenOf
            }}{{ increase.choice.count }}
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="ability in increase.choice.from"
            :key="ability"
            size="sm"
            :color="
              chosenAbilities(increase, increase.choice).includes(ability)
                ? 'primary'
                : 'neutral'
            "
            :variant="
              chosenAbilities(increase, increase.choice).includes(ability)
                ? 'solid'
                : 'outline'
            "
            :disabled="
              !chosenAbilities(increase, increase.choice).includes(ability)
              && chosenAbilities(increase, increase.choice).length
                >= increase.choice.count
            "
            @click.left.exact.prevent="
              toggleAbility(increase, increase.choice, ability)
            "
          >
            {{ ABILITY_LABELS[ability] }}
          </UButton>
        </div>
      </template>
    </div>

    <!-- Итог по всем характеристикам -->
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div
        v-for="{ value: ability } in ABILITY_OPTIONS"
        :key="ability"
        class="flex items-baseline gap-1.5 rounded-md border border-default/50 bg-elevated/30 px-2.5 py-1.5"
      >
        <span class="truncate text-base font-medium text-toned">
          {{ ABILITY_LABELS[ability] }}
        </span>

        <span class="text-base font-bold text-highlighted">
          {{ currentAbilities[ability] ?? 10 }}
        </span>

        <template v-if="(totals[ability] ?? 0) !== 0">
          <span class="text-base text-dimmed">→</span>

          <span class="text-base font-bold text-healing">
            {{ (currentAbilities[ability] ?? 10) + (totals[ability] ?? 0) }}
          </span>
        </template>
      </div>
    </div>
  </div>
</template>
