<script setup lang="ts">
  import type { AbilityType } from '@vtt/shared';
  import type { SpeciesAbilityGrant } from '@vtt/shared/system/dnd.js';

  import { ABILITY_OPTIONS } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  const props = defineProps<{
    /** Текущее повышение характеристик (вида или подвида). */
    modelValue: SpeciesAbilityGrant | null;
  }>();

  const emit = defineEmits<{
    'update:modelValue': [value: SpeciesAbilityGrant | null];
  }>();

  const fixed = computed(() => props.modelValue?.fixed ?? {});
  const choice = computed(() => props.modelValue?.choice ?? null);

  /**
   * Собирает новое значение и отдаёт наверх. Пустой грант отдаётся как `null`:
   * так в JSON вида не появляется `abilityGrant: {}` у тех, кто ничего не даёт.
   *
   * @param next - новое содержимое гранта
   */
  function emitGrant(next: SpeciesAbilityGrant): void {
    const hasFixed = Object.values(next.fixed ?? {}).some(
      (bonus) => (bonus ?? 0) !== 0,
    );

    const hasChoice = (next.choice?.count ?? 0) > 0;

    emit('update:modelValue', hasFixed || hasChoice ? next : null);
  }

  /**
   * Правит фиксированную прибавку к одной характеристике.
   *
   * @param ability - характеристика
   * @param bonus - новое значение прибавки (0 убирает её)
   */
  function setFixed(ability: AbilityType, bonus: number): void {
    const nextFixed = { ...fixed.value };

    if (bonus === 0) {
      Reflect.deleteProperty(nextFixed, ability);
    } else {
      nextFixed[ability] = bonus;
    }

    emitGrant({ fixed: nextFixed, ...(choice.value ? { choice: choice.value } : {}) });
  }

  /**
   * Правит группу выбора: сколько характеристик и на сколько поднимаются.
   *
   * @param patch - изменяемые поля группы
   */
  function setChoice(patch: { count?: number; amount?: number }): void {
    const next = {
      amount: patch.amount ?? choice.value?.amount ?? 1,
      count: patch.count ?? choice.value?.count ?? 0,
      ...(choice.value?.from ? { from: choice.value.from } : {}),
    };

    emitGrant({ fixed: { ...fixed.value }, choice: next });
  }

  /**
   * Задаёт, из каких характеристик можно выбирать. Пустой список — из любых.
   *
   * @param abilities - разрешённые характеристики
   */
  function setChoiceFrom(abilities: AbilityType[]): void {
    emitGrant({
      fixed: { ...fixed.value },
      choice: {
        amount: choice.value?.amount ?? 1,
        count: choice.value?.count ?? 0,
        ...(abilities.length > 0 ? { from: abilities } : {}),
      },
    });
  }
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <UFormField
        v-for="option in ABILITY_OPTIONS"
        :key="option.value"
        :label="option.label"
      >
        <UInputNumber
          :model-value="fixed[option.value] ?? 0"
          :min="0"
          :max="10"
          class="w-full"
          @update:model-value="(bonus: number) => setFixed(option.value, bonus)"
        />
      </UFormField>
    </div>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <UFormField label="Выбор: сколько характеристик">
        <UInputNumber
          :model-value="choice?.count ?? 0"
          :min="0"
          :max="6"
          class="w-full"
          @update:model-value="(count: number) => setChoice({ count })"
        />
      </UFormField>

      <UFormField label="На сколько поднимается">
        <UInputNumber
          :model-value="choice?.amount ?? 1"
          :min="1"
          :max="5"
          class="w-full"
          @update:model-value="(amount: number) => setChoice({ amount })"
        />
      </UFormField>

      <UFormField label="Из каких (пусто — из любых)">
        <USelectMenu
          :model-value="choice?.from ?? []"
          :items="ABILITY_OPTIONS"
          value-key="value"
          label-key="label"
          multiple
          class="w-full"
          placeholder="Любые"
          @update:model-value="setChoiceFrom"
        />
      </UFormField>
    </div>
  </div>
</template>
