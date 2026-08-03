# 2MA — рейтинговый Zuma (MVP)

Мультиплеер 1v1 на Colyseus, отрисовка на Phaser, пользователи и рейтинг в MongoDB, вход через Яндекс ID OAuth (или DEV-вход).

## Запуск одной командой (Docker)

```bash
docker compose up --build -d
# или: npm run up
```

Откройте **http://localhost:8080** (клиент). WebSocket/API сервера — порт **2567**.

Остановка: `docker compose down` / `npm run down`. Логи: `npm run logs`.

Переменные берутся из `.env` (см. `.env.example`). Для Docker `CLIENT_ORIGIN` по умолчанию `http://localhost:8080`, Mongo внутри сети — `mongodb://mongo:27017/zuma`.

## Локальная разработка без полного Docker

```bash
docker compose up -d mongo   # только БД
npm install
npm run build -w shared
npm run dev:server           # :2567
npm run dev:client           # :5173
```

Откройте http://localhost:5173.

## Env

Скопируйте `.env.example` → `.env`. Для Яндекс OAuth заполните `YANDEX_CLIENT_ID` / `YANDEX_CLIENT_SECRET`. Пока они пустые и `DEV_AUTH=true` — доступен локальный вход без Яндекса.

## Управление в игре

- Движение мыши — прицел
- ЛКМ — выстрел
- Tab — цель: своя / чужая цепочка
- Карта при уровне — кнопка в центре экрана
