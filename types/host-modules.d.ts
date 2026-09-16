/**
 * Заглушки модулей ПРИЛОЖЕНИЯ (хоста) для проверки типов.
 *
 * Система собирается вне монорепы VTTG: перечисленные ниже модули не входят в
 * бандл, а резолвятся в рантайме из `globalThis.__VTTHost` (список-источник —
 * `HOST_MODULE_IDS` в `vite.config.ts`). Их исходников здесь нет, а SDK их пока
 * не публикует — см. «Чего не хватает для полноценного SDK», пункт 2 в README.
 *
 * Поэтому объявления ниже — СОКРАЩЁННЫЕ (`declare module 'x';`): всё, что из них
 * импортируется, получает тип `any`. Это осознанная дыра, и она ровно там, где
 * проходит граница системы и приложения:
 *
 * - `ClientSystemAPI` (`@/core/systemBootstrap`) — главный контракт клиентской
 *   части системы — сейчас НЕ проверяется;
 * - пропы и события хостовых `.vue`-компонентов (`UDraggableModal` и прочие) —
 *   тоже нет.
 *
 * Что проверяется полноценно: движок правил (`src/engine`), сервер, нейтральное
 * ядро (`sdk`) и вся собственная логика клиента, включая обращения к типам
 * движка из шаблонов.
 *
 * Дыра закрывается, когда платформа опубликует типы хоста: тогда этот файл
 * заменяется на импорт реальных деклараций, и `ClientSystemAPI` начнёт ловить
 * расхождения контракта.
 *
 * ВАЖНО: список обязан совпадать с `HOST_MODULE_IDS` из `vite.config.ts`
 * (плюс type-only `@/core/systemBootstrap`, которого там нет — он стирается при
 * сборке и потому не нуждается в пометке external).
 */

// ── Ядро приложения ───────────────────────────────────────────
declare module '@/core/actorDragState';
declare module '@/core/api/chatService';
declare module '@/core/clientHooks';
declare module '@/core/compendiumDataClient';
declare module '@/core/mimeTypes';
declare module '@/core/registries/macroRegistry';
declare module '@/core/tokenConsts';
declare module '@/core/utils/hotbarDrag';

/*
 * Три модуля ниже объявлены С ТЕЛОМ: из них импортируются не только значения,
 * но и ТИПЫ, а сокращённое объявление (`declare module 'x';`) даёт на импорт
 * неймспейс, а не тип, — `import type { ClientSystemAPI }` из него не работает
 * («Cannot use namespace as a type»).
 *
 * Тело перечисляет только то, что система реально импортирует. Добавился новый
 * импорт из этих модулей — его нужно дописать сюда, иначе проверка типов
 * сообщит об отсутствующем экспорте. Это плата за отсутствие опубликованных
 * типов хоста и одновременно тот самый список, который в SDK должен приехать
 * настоящими декларациями.
 */

declare module '@/core/systemBootstrap' {
  /** Контракт клиентской части системы. Типы хоста не опубликованы. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ClientSystemAPI = any;
}

declare module '@/core/entityUtils' {
  /*
   * `requireSocket` — функция-утверждение: после её вызова сокет считается
   * ненулевым. Сокращённое объявление модуля стирало бы это, и каждый
   * `props.socket.emit(…)` после проверки падал бы как «possibly null» —
   * проверка сообщала бы о несуществующей ошибке.
   */
  export function requireSocket(
    socket: import('@vtt/shared').TypedWebSocketClient | null | undefined,
  ): asserts socket is import('@vtt/shared').TypedWebSocketClient;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const emitEntityUpdate: any;
  export function generateEntityId(prefix: string): string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const resolveTokenScale: any;
}

declare module '@/core/extensionRegistry' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ExtensionRegistration = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const getExtensions: any;
}

declare module '@/core/registries' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ItemFormContext = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ItemTypeMeta = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ItemTypeProvider = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const getEntityCard: any;
}

// ── Общий UI приложения ───────────────────────────────────────
declare module '@/shared_ui/components';
declare module '@/shared_ui/components/AssetBrowser.vue';
declare module '@/shared_ui/components/CardErrorFallback.vue';
declare module '@/shared_ui/components/EntityCard.vue';
declare module '@/shared_ui/components/FieldGroupReset.vue';
declare module '@/shared_ui/components/FieldsetLabel.vue';
declare module '@/shared_ui/components/ItemDescriptionRenderer.vue';
declare module '@/shared_ui/components/JournalEditor.vue';
declare module '@/shared_ui/components/LightEmitterEditor.vue';
declare module '@/shared_ui/components/RichTextEditor.vue';
declare module '@/shared_ui/components/SendToChatButton.vue';
declare module '@/shared_ui/components/TokenMediaPreview.vue';
declare module '@/shared_ui/components/UDraggableModal.vue';
declare module '@/shared_ui/composables';
declare module '@/shared_ui/composables/useActiveTab';
declare module '@/shared_ui/composables/useCompendiumView';
declare module '@/shared_ui/composables/useModalManager';
declare module '@/shared_ui/consts';
declare module '@/shared_ui/utils/componentUtils';
declare module '@/shared_ui/utils/domUtils';

// ── Хранилища приложения ──────────────────────────────────────
declare module '@/stores/actionPromptStore';
declare module '@/stores/auraStore';
declare module '@/stores/chatStore';
declare module '@/stores/diceRollerStore';
declare module '@/stores/hotbarStore';
declare module '@/stores/initiativeStore';
declare module '@/stores/itemsStore';
declare module '@/stores/journalStore';
declare module '@/stores/projectileStore';
declare module '@/stores/spellTemplateStore';
declare module '@/stores/targetStore';
declare module '@/stores/worldStore';

// ── Рантайм системы ───────────────────────────────────────────
declare module '@/system-runtime/activeSocket';
