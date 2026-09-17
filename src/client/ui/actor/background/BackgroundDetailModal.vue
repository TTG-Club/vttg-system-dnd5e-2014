<script setup lang="ts">
  import type { BackgroundDefinition } from '@vtt/shared/system/dnd.js';

  import {
    buildFeatGrantsSummary,
    SKILLS_LABELS,
    TOOLS_LABELS,
  } from '@vtt/shared/system/dnd.js';
  import { computed } from 'vue';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';
  import SendToChatButton from '@/shared_ui/components/SendToChatButton.vue';
  import UDraggableModal from '@/shared_ui/components/UDraggableModal.vue';
  import { useSourceLabels } from '@/systems/dnd5e/composables/useSourceLabel';

  const props = defineProps<{
    open: boolean;
    backgroundDefinition?: BackgroundDefinition | null;
    item?: BackgroundDefinition | null;
    zIndex?: number;
    positionOffset?: number;
    showCopyButton?: boolean;
  }>();

  const data = computed(() => props.item ?? props.backgroundDefinition);

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'bring-to-front': [];
    'copy': [];
  }>();

  const initialPosition = computed(() =>
    props.positionOffset
      ? { x: props.positionOffset, y: props.positionOffset }
      : undefined,
  );

  /** Непустые таблицы характера — только те, что автор заполнил. */
  const personalitySections = computed(() => {
    const personality = data.value?.personality;

    if (!personality) {
      return [];
    }

    return [
      { title: 'Черты характера', entries: personality.traits ?? [] },
      { title: 'Идеалы', entries: personality.ideals ?? [] },
      { title: 'Привязанности', entries: personality.bonds ?? [] },
      { title: 'Слабости', entries: personality.flaws ?? [] },
    ].filter((section) => section.entries.length > 0);
  });

  /** Список навыков с русскими названиями */
  const skillsDisplay = computed(() => {
    if (!data.value?.skillGrant?.skills) {
      return '';
    }

    return data.value.skillGrant.skills
      .map((skill) => SKILLS_LABELS[skill] || skill)
      .join(', ');
  });

  /** Строка инструментов */
  const toolsDisplay = computed(() => {
    if (!data.value?.toolGrant) {
      return '';
    }

    let toolsStr = (data.value.toolGrant.items || [])
      .map((tool) => TOOLS_LABELS[tool] || tool)
      .join(', ');

    if (data.value.toolGrant.choices?.count) {
      if (toolsStr) {
        toolsStr += ' и ';
      }

      toolsStr += `${data.value.toolGrant.choices.count} на выбор из списка`;
    }

    return toolsStr;
  });

  /**
   * Авто-сводка расширenных даров (владения/защиты/языки/тёмное зрение/
   * заклинания/эффекты) из `featData`+`activeEffects`. Пусто — блок скрыт.
   */
  const grantsSummary = computed(() =>
    data.value ? buildFeatGrantsSummary(data.value) : '',
  );

  const { getSourceLabel } = useSourceLabels();

</script>

<template>
  <UDraggableModal
    :open="open"
    :title="data ? data.name : 'Предыстория'"
    :subtitle="data?.nameEn || undefined"
    :initial-width="800"
    :initial-height="600"
    :min-width="400"
    :min-height="400"
    :resizable="true"
    :z-index="zIndex"
    :saved-position="initialPosition"
    @update:open="emit('update:open', $event)"
    @bring-to-front="emit('bring-to-front')"
  >
    <template #header-actions>
      <UBadge
        v-if="getSourceLabel(data?.sourceKey)"
        :label="getSourceLabel(data?.sourceKey)"
        color="neutral"
        variant="subtle"
        size="sm"
      />

      <UBadge
        v-if="data?.isSRD !== false"
        label="SRD"
        color="primary"
        variant="subtle"
        size="sm"
      />

      <UTooltip
        v-if="showCopyButton"
        text="Скопировать в предметы"
      >
        <UButton
          icon="tabler:copy"
          size="xs"
          color="primary"
          variant="soft"
          @click.left.exact.prevent="emit('copy')"
        />
      </UTooltip>

      <SendToChatButton
        v-if="data"
        card-type="background"
        :title="data.name"
        :payload="JSON.stringify(data)"
      />
    </template>

    <template #body>
      <div
        v-if="data"
        class="flex flex-col gap-4"
      >
        <!-- Описание -->
        <ItemDescriptionRenderer :content="data.description" />

        <!-- Что даёт предыстория, в виде сетки -->
        <div class="grid grid-cols-2 gap-2">
          <!-- Навыки -->
          <div
            class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Навыки</span
            >

            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{ skillsDisplay }}
            </p>
          </div>

          <!-- Инструменты -->
          <div
            v-if="
              data.toolGrant?.items?.length || data.toolGrant?.choices?.count
            "
            class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5 text-center"
          >
            <span
              class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
              >Инструменты</span
            >

            <p class="mt-0.5 text-sm font-semibold text-highlighted">
              {{ toolsDisplay }}
            </p>
          </div>
        </div>


        <!-- Особенность предыстории -->
        <div
          v-if="data.feature"
          class="rounded-lg border border-default/50 p-4"
        >
          <h3 class="mb-1 text-sm font-semibold tracking-wider text-primary">
            ОСОБЕННОСТЬ
          </h3>

          <p class="mb-2 text-sm font-semibold text-highlighted">
            {{ data.feature.name }}
          </p>

          <ItemDescriptionRenderer :content="data.feature.description" />
        </div>

        <!-- Таблицы характера -->
        <div
          v-if="personalitySections.length"
          class="rounded-lg border border-default/50 p-4"
        >
          <h3 class="mb-3 text-sm font-semibold tracking-wider text-primary">
            ХАРАКТЕР
          </h3>

          <div class="space-y-3">
            <div
              v-for="section in personalitySections"
              :key="section.title"
            >
              <span
                class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
                >{{ section.title }}</span
              >

              <ol class="mt-1 space-y-0.5">
                <li
                  v-for="(entry, idx) in section.entries"
                  :key="idx"
                  class="flex gap-2 text-sm text-toned"
                >
                  <span class="shrink-0 text-dimmed">{{ idx + 1 }}.</span>

                  <span>{{ entry }}</span>
                </li>
              </ol>
            </div>
          </div>
        </div>

        <!-- Дополнительные дары (featData / activeEffects) -->
        <div
          v-if="grantsSummary"
          class="rounded-lg border border-default/50 p-4"
        >
          <h3 class="mb-3 text-sm font-semibold tracking-wider text-primary">
            ДОПОЛНИТЕЛЬНЫЕ ДАРЫ
          </h3>

          <ItemDescriptionRenderer :content="grantsSummary" />
        </div>

        <!-- Стартовое снаряжение -->
        <div
          v-if="data.equipmentOptions?.length"
          class="rounded-lg border border-default/50 p-4"
        >
          <h3 class="mb-3 text-sm font-semibold tracking-wider text-primary">
            СНАРЯЖЕНИЕ
          </h3>

          <ul class="space-y-3">
            <li
              v-for="(option, idx) in data.equipmentOptions"
              :key="idx"
              class="flex items-start gap-2"
            >
              <div
                class="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-elevated text-[10px] text-muted"
              >
                {{ idx === 0 ? 'А' : 'Б' }}
              </div>

              <p class="text-sm text-toned">
                <ItemDescriptionRenderer :content="option.description" />
              </p>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </UDraggableModal>
</template>
