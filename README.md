# Aetherfall

Платформа интерактивных историй с AI-рассказчиком: ранобэ, визуальные новеллы, текстовые RPG. Игрок говорит, действует, молчит, показывает эмоции, использует способности и предметы, комбинирует действия. AI ведёт сюжет, а состояние игры принадлежит приложению: AI только предлагает изменения, движок их проверяет и применяет.

Подробности архитектуры: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Запуск

Нужны Node.js 22+ и pnpm 10+.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # заполните ключи, если есть
pnpm dev                                        # http://localhost:3000
```

Production-сборка: `pnpm build && pnpm start`. Проверки: `pnpm check` (typecheck + lint + тесты).

База SQLite создаётся автоматически в `apps/web/data/aetherfall.db` (путь меняется через `DATABASE_PATH`). Демо-сценарий «Aetherfall Academy» добавляется при первом запуске.

## AI-провайдеры

Ключи читаются только сервером из `apps/web/.env.local` и не попадают в браузер, в базу или в логи.

| Провайдер | Как подключить | Что тратится |
|---|---|---|
| Claude API | `ANTHROPIC_API_KEY` | API-кредиты Anthropic |
| OpenAI API | `OPENAI_API_KEY` (также рисует иллюстрации) | API-кредиты OpenAI |
| Подписка ChatGPT | Официальный Codex: приложение Codex (в том числе из Microsoft Store) или `npm i -g @openai/codex`, вход «Sign in with ChatGPT». Приложение находит CLI само | Лимит вашей подписки ChatGPT |
| Демо-рассказчик | Ничего, включается сам, если нет других | Ничего |

По умолчанию рассказчик выбирается автоматически: Claude, затем ChatGPT-подписка, затем OpenAI. Запасного рассказчика на случай лимитов и сбоев можно выбрать в «Настройки → AI-рассказчик».

**Подписка ChatGPT.** OpenAI разрешает использовать план ChatGPT в сторонних инструментах через вход «Sign in with ChatGPT». Приложение вызывает Codex CLI на вашем компьютере и не читает, не копирует и не хранит данные входа. Поэтому это работает, только когда приложение запущено локально, там же, где установлен и авторизован CLI.

**Подписка Claude.** Anthropic запрещает использовать OAuth-вход подписок Claude Pro/Max в сторонних продуктах, поэтому Claude подключается только по API-ключу.

**Демо-рассказчик** — детерминированный шаблонный провайдер без нейросети. Вся механика (способности, время, отношения, память, хронология, сохранения) работает полностью, но текст простой. Интерфейс всегда показывает, когда отвечает он.

## Что внутри

- `packages/core` — чистый TypeScript: Zod-схемы сценария и состояния, игровой движок, Context Engine, память, AI Router и провайдеры, создатель сценариев, формат `.scenario`, миграции, демо-сценарий.
- `apps/web` — Next.js (App Router), React, Tailwind, TanStack Query, Drizzle + SQLite.

## Desktop (Tauri)

Desktop-версия запускает тот же сервер Next.js со встроенным Node.js на свободном порту `127.0.0.1` и показывает его в окне.

Сборка (нужны Rust, а на Windows ещё MSVC Build Tools и WebView2):

```bash
pnpm install
pnpm --filter @aetherfall/desktop build
```

На Windows собирайте из короткого пути, например `C:\aetherfall`: NSIS не справляется с путями длиннее 260 символов.

Установщик появится в `apps/desktop/src-tauri/target/release/bundle/` (на Windows это `nsis/Aetherfall_*_x64-setup.exe`).

Ключи хранятся в файле `aetherfall.env` в папке настроек приложения (на Windows `%APPDATA%\app.aetherfall.desktop\aetherfall.env`). Файл создаётся при первом запуске, и его путь показан в «Настройки → AI». Ключи читает только локальный сервер, в окно они не попадают. База и журнал сервера лежат в `%APPDATA%\app.aetherfall.desktop` (Windows), `~/.local/share/app.aetherfall.desktop` (Linux) или `~/Library/Application Support/app.aetherfall.desktop` (macOS).
