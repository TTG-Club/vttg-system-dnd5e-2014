<script setup lang="ts">
  import type { AbilityType } from '@vtt/shared';
  import type { SpeciesAbilityIncreases } from '@vtt/shared/system/dnd.js';

  import { typedObjectEntries } from '@vtt/shared';
  import { ABILITY_LABELS, ABILITY_OPTIONS } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  const props = defineProps<{
    /** Повышения вида: фиксированные и группы выбора. */
    increases: SpeciesAbilityIncreases;
    /** Выбор игрока по каждой группе (индекс группы → характеристики). */
    selections: Record<number, AbilityType[]>;
  }>();

  const emit = defineEmits<{
    'update:selections': [value: Record<number, AbilityType[]>];
  }>();

  /** Фиксированные прибавки вида и подвида — их игрок не меняет. */
  const fixedRows = computed(() =>
    typedObjectEntries<AbilityType, number>(props.increases.fixed)
      .filter(([, bonus]) => Boolean(bonus))
      .map(([ability, bonus]) => ({
        label: ABILITY_LABELS[ability] ?? ability,
        bonus: bonus ?? 0,
      })),
  );

  /**
   * Варианты для группы выбора: заданный автором набор или все характеристики,
   * если набор не сужен.
   *
   * @param groupIndex - номер группы выбора
   */
  function optionsForGroup(groupIndex: number) {
    const allowed = props.increases.choices[groupIndex]?.from;

    if (!allowed || allowed.length === 0) {
      return ABILITY_OPTIONS;
    }

    return ABILITY_OPTIONS.filter((option) => allowed.includes(option.value));
  }

  /** Выбрана ли характеристика в этой группе. */
  function isPicked(groupIndex: number, ability: AbilityType): boolean {
    return (props.selections[groupIndex] ?? []).includes(ability);
  }

  /**
   * Нельзя ли ещё выбирать в этой группе: набрано нужное количество, а эта
   * характеристика не выбрана.
   */
  function isLocked(groupIndex: number, ability: AbilityType): boolean {
    const choice = props.increases.choices[groupIndex];
    const picked = props.selections[groupIndex] ?? [];

    return !!choice && picked.length >= choice.count && !picked.includes(ability);
  }

  /**
   * Переключает характеристику в группе выбора.
   *
   * @param groupIndex - номер группы
   * @param ability - характеристика
   */
  function togglePick(groupIndex: number, ability: AbilityType): void {
    const choice = props.increases.choices[groupIndex];

    if (!choice) {
      return;
    }

    const picked = props.selections[groupIndex] ?? [];

    const next = picked.includes(ability)
      ? picked.filter((entry) => entry !== ability)
      : [...picked, ability];

    if (next.length > choice.count) {
      return;
    }

    emit('update:selections', { ...props.selections, [groupIndex]: next });
  }
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="fixedRows.length > 0"
      class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5"
    >
      <span
        class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
        >Даёт вид</span
      >

      <div class="mt-1.5 flex flex-wrap gap-1.5">
        <UBadge
          v-for="row in fixedRows"
          :key="row.label"
          variant="subtle"
          color="neutral"
          size="sm"
        >
          {{ row.label }} +{{ row.bonus }}
        </UBadge>
      </div>
    </div>

    <div
      v-for="(choice, groupIndex) in increases.choices"
      :key="groupIndex"
      class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5"
    >
      <span
        class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
      >
        Выберите {{ choice.count }} — по +{{ choice.amount }}
      </span>

      <div class="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <UButton
          v-for="option in optionsForGroup(groupIndex)"
          :key="option.value"
          size="sm"
          :color="isPicked(groupIndex, option.value) ? 'primary' : 'neutral'"
          :variant="isPicked(groupIndex, option.value) ? 'solid' : 'subtle'"
          :disabled="isLocked(groupIndex, option.value)"
          @click.left.exact.prevent="togglePick(groupIndex, option.value)"
        >
          {{ option.label }}
        </UButton>
      </div>
    </div>
  </div>
</template>
