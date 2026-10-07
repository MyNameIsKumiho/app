# Aetherfall — архитектура MVP

Платформа интерактивных AI-историй: игрок живёт внутри сценария, AI рассказывает,
а **приложение** владеет фактическим состоянием игры.

## 1. Анализ требований (сжатый)

| Принцип | Как реализуется |
|---|---|
| Состояние принадлежит приложению | `GameState` (Zod) хранится в БД. AI возвращает только *предложения изменений* (`TurnResult`), движок валидирует и применяет их. |
| Player agency | Игрок пишет любое действие; быстрые действия — это лишь конструктор намерения (`PlayerAction`). Storyteller-промпт запрещает говорить и решать за игрока. |
| NPC знают только то, что узнали | `knowledge`/`secrets` у NPC и игрока раздельно; Context Engine передаёт AI явный список «чего NPC НЕ знает»; движок отклоняет изменения, раскрывающие секрет без события-раскрытия. |
| Экономия контекста | Context Engine собирает контекст по бюджету из уровней памяти (recent → scene → arc → long-term → permanent facts). |
| Provider independence | `AIProvider` интерфейс, `AIRouter` с fallback; Claude/OpenAI/Mock — реализации. |
| Пользовательские миры | Движок не знает ни одной франшизы: всё (категории способностей, параметры отношений, система, характеристики, поля персонажа) задаёт сценарий. |
| Сохранения не ломаются | Сохранение хранит `scenarioVersion` и снапшот сценария; есть цепочка миграций формата. |
| Откат хода | Event log ходов + полный снапшот `GameState` после каждого хода. |

## 2. Архитектура

```
apps/web (Next.js App Router)
 ├─ UI (React, Tailwind, TanStack Query)        ← только отображение и ввод
 ├─ app/api/*  (route handlers = backend API)   ← Zod-валидация входа, без бизнес-логики
 └─ server/
     ├─ db/            Drizzle + SQLite (better-sqlite3)
     ├─ repositories/  Persistence
     └─ services/      Оркестрация: StoryService, CreatorService, ImageService
packages/core (чистый TypeScript, без React/Next/БД — легко тестировать и переносить)
 ├─ domain/         Zod-схемы: Scenario, GameState, Ability, NPC, Memory, Actions, AI-ответы
 ├─ engine/         Game Engine: применение изменений, время, timeline/divergence, отношения
 ├─ scenario/       Scenario Engine: старт игры, валидатор, компилятор правил, import/export, миграции, remix
 ├─ context/        Context Engine: сборка контекста по бюджету
 ├─ memory/         Memory Engine: память NPC, уровни памяти, importance
 ├─ ai/             AI Router, интерфейс провайдера, структурированный вывод (repair/retry), промпты
 │   └─ providers/  ClaudeProvider, OpenAIProvider, MockProvider
 ├─ image/          ImageProvider, OpenAIImageProvider, MockImageProvider, промпт из Visual Profile
 ├─ creator/        AI Scenario Creator: wizard, draft, ассистент редактора (patch-предложения)
 └─ demo/           Оригинальный демо-сценарий «Aetherfall Academy»
```

**Почему так:** вся игровая логика в `core` — её же будет использовать desktop
(Tauri) и будущий community-сервер. Next.js route handlers — тонкий слой.
Ключи API читаются только на сервере (`process.env`), в клиентский bundle не попадают.

**Desktop (Tauri):** Tauri-оболочка запускает Next.js-сервер как sidecar и
открывает его в окне. В MVP приложение запускается как web (`pnpm dev`);
Tauri-обёртка — следующий этап (см. план), архитектура под неё готова.

**State management:** серверное состояние (сценарии, игры, ходы) — TanStack Query:
кэш, loading/error из коробки, инвалидация после хода. Локальное UI-состояние —
обычный React state внутри компонентов: глобального клиентского стора не нужно,
потому что источник правды — backend.

## 3. Ход игры (pipeline)

```
PlayerAction (UI) → POST /api/stories/:id/turns
  → StoryService
    1. загрузить GameState + Scenario
    2. engine.describeAction()          — нормализовать комбинированное действие
    3. contextEngine.build()            — контекст в пределах бюджета
    4. aiRouter.generateStructured(TurnResultSchema)  — Claude → OpenAI fallback, repair/retry
    5. engine.applyTurnResult()         — валидация каждого изменения, отклонённые логируются
    6. engine.advanceTime() + timeline.process()      — мировые события, divergence
    7. memoryEngine.ingest()            — память NPC, importance, summaries при переполнении
    8. сохранить Turn (event + snapshot) и autosave
  ← narrative, применённые/отклонённые изменения, suggestedActions
```

## 4. Схема БД (SQLite, Drizzle)

| Таблица | Ключевые поля |
|---|---|
| `scenarios` | id, title, version, status (draft/private/published), origin (original/fan), authorName, allowRemix, originalScenarioId, originalAuthor, data (JSON Scenario), createdAt, updatedAt |
| `scenario_versions` | scenarioId, version, data — неизменяемые опубликованные версии (для сохранений) |
| `library_entries` | scenarioId, favorite, addedAt |
| `stories` | id, scenarioId, scenarioVersion, title, characterName, state (JSON GameState текущий), createdAt, updatedAt |
| `turns` | id, storyId, index, action (JSON), narrative, result (JSON применённые изменения), stateAfter (JSON snapshot), aiMeta, createdAt |
| `saves` | id, storyId, slot, kind (auto/manual), label, turnIndex, state, scenarioVersion, createdAt |
| `images` | id, storyId?, scenarioId?, kind, prompt, url/dataUri, provider, createdAt |
| `settings` | key, value (JSON) — настройки AI без секретов |
| `creator_sessions` | id, idea, questions, answers, draft (JSON), messages, createdAt |

В будущем — PostgreSQL: Drizzle-схема переносится заменой драйвера; JSON → jsonb.

## 5–6. Scenario и GameState

См. `packages/core/src/domain/scenario.ts` и `gameState.ts` — это источник правды.
Ключевые решения:
- Сценарий описывает **определения** (NPC, способности, предметы, локации, квесты,
  timeline, система, правила). `GameState` хранит **текущие экземпляры**.
- Параметры отношений (`relationshipAxes`), категории способностей, поля создания
  персонажа, характеристики и система — расширяемые, задаются сценарием.
- Правила для AI задаются человеческими настройками (`AIRules`), а
  `rulesCompiler` превращает их во внутренние инструкции.

## 7. AI-интерфейсы

```ts
interface AIProvider {
  id; isAvailable();
  generateText(req): Promise<{ text, usage }>        // story / summarize
  generateStructured<T>(req, schema): Promise<T>      // через structured.ts
}
```
Высокоуровневые операции (`generateStory`, `summarize`, `generateScenario`,
`generateCharacter`, `generateSuggestions`) живут в `ai/operations.ts` поверх
`AIRouter` и не зависят от провайдера. Ошибки классифицируются
(`rate_limit`, `quota`, `unavailable`, `invalid_output`) — по ним Router решает о fallback.

## 8. UI routes

| Route | Экран |
|---|---|
| `/` | Главный: Continue / New Story / Explore / Library / Create / Settings |
| `/library` | Мои сценарии и избранное, импорт `.scenario` |
| `/explore` | Опубликованные локально сценарии, поиск, фильтры по тегам |
| `/scenarios/[id]` | Карточка: Play / Library / Favorite / Share(export) / Edit / Remix |
| `/create` | Выбор: AI Wizard или пустой сценарий |
| `/create/wizard` | Wizard: идея → вопросы → варианты → draft → правки → проверка → публикация |
| `/scenarios/[id]/edit` | Продвинутый редактор + постоянный AI-ассистент |
| `/play/new/[scenarioId]` | Создание персонажа |
| `/play/[storyId]` | Экран истории + панель персонажа + сохранения |
| `/settings` | AI-настройки (Story/Fallback/Image, Advanced скрыт) |

## 9. План реализации

1. Монорепо, tooling (TS strict, ESLint, Vitest). ✔
2. Domain-схемы + демо-сценарий + тесты валидации.
3. Game Engine (изменения, время, timeline, отношения, знания) + тесты.
4. Memory + Context Engine + тесты бюджета и защиты секретов.
5. AI: провайдеры, Router c fallback, structured repair/retry, Mock + тесты.
6. Scenario Engine: валидатор, компилятор правил, import/export, миграции, remix.
7. Creator: wizard, draft, ассистент с patch-предложениями.
8. Backend: БД, репозитории, сервисы, API.
9. UI: главный экран → библиотека → создание персонажа → экран истории → редактор → wizard → настройки.
10. Изображения: абстракция + OpenAI + Mock, режимы Never/Manual/Important/Frequently.
11. Далее (после MVP): Tauri-оболочка, community-backend (PostgreSQL, аккаунты, рейтинги), BYOK через OS keychain, AI credits.
