<script setup lang="ts">
  import type { BackgroundDefinition } from '@vtt/shared/system/dnd.js';

  import { SKILLS_LABELS, TOOLS_LABELS } from '@vtt/shared/system/dnd.js';

  import ItemDescriptionRenderer from '@/shared_ui/components/ItemDescriptionRenderer.vue';

  defineProps<{
    backgroundDefinition: BackgroundDefinition;
  }>();
</script>

<template>
  <div class="space-y-6">
    <ItemDescriptionRenderer :content="backgroundDefinition.description" />

    <!-- Резюме -->
    <div class="grid grid-cols-2 gap-2">
      <div
        class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5"
      >
        <span
          class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
          >Навыки</span
        >

        <div class="mt-1.5 flex flex-wrap gap-1.5">
          <UBadge
            v-for="skill in backgroundDefinition.skillGrant.skills"
            :key="skill"
            variant="subtle"
            color="neutral"
            size="sm"
          >
            {{ SKILLS_LABELS[skill] }}
          </UBadge>
        </div>
      </div>

      <div
        class="rounded-lg border border-default/50 bg-elevated/30 px-3 py-2.5"
      >
        <span
          class="block text-[10px] font-medium tracking-wider text-dimmed uppercase"
          >Инструменты</span
        >

        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <UBadge
            v-for="tool in backgroundDefinition.toolGrant.items"
            :key="tool"
            variant="subtle"
            color="neutral"
            size="sm"
          >
            {{ TOOLS_LABELS[tool] || tool }}
          </UBadge>

          <span
            v-if="backgroundDefinition.toolGrant.choices?.count"
            class="text-sm font-semibold text-highlighted"
          >
            {{ backgroundDefinition.toolGrant.items.length > 0 ? 'и ' : ''
            }}{{ backgroundDefinition.toolGrant.choices.count }} на выбор из
            списка
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
