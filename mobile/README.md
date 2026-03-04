# NEPSE Research – Mobile (React Native / Expo)

React Native app for **NEPSE Research**, using the same FastAPI backend as the web app. Built with **Expo** and **Expo Router**.

## Prerequisites

- Node.js 18+
- Yarn or npm
- iOS: Xcode (Mac) for simulator or device
- Android: Android Studio / SDK for emulator or device
- Backend API running (see project root README)

## Setup

1. **Install dependencies**

   ```bash
   cd mobile
   npm install
   ```
   (If you use Yarn at the repo root, you can run `yarn install` here only if a lockfile exists; otherwise use `npm install`.)

2. **Configure API URL**

   Copy `.env.example` to `.env` and set your backend URL:

   ```bash
   cp .env.example .env
   ```

   - **iOS Simulator:** `EXPO_PUBLIC_API_URL=http://localhost:8000` (or `http://localhost:8212/api` if using Docker with nginx proxy)
   - **Android Emulator:** `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000` (or `http://10.0.2.2:8212/api` with Docker)
   - **Physical device:** Use your computer’s LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.5:8000`

   Ensure the backend allows requests from the app (CORS if needed; same network for LAN IP).

3. **Start the app**

   ```bash
   npx expo start
   ```

   Then:

   - Press **i** for iOS simulator
   - Press **a** for Android emulator
   - Or scan the QR code with the **Expo Go** app on a physical device (same Wi‑Fi as your machine)

## Project structure

- `app/` – Expo Router screens
  - `(tabs)/` – Tab navigator (Dashboard, Screener)
  - `company/[symbol].tsx` – Company detail
- `src/` – Shared logic
  - `api/client.ts` – API client (companies, analyses)
  - `types/company.ts` – TypeScript types
  - `lib/screening.ts` – Risk / investability / entry timing helpers

## Features

- **Dashboard** – Most investable, low risk, high risk, time to invest, wait for entry
- **Screener** – Search and filter by risk, investability, entry timing
- **Company detail** – Overview, analysis scores, final decision, who should invest/avoid

The app talks to the same backend as the web frontend; no backend changes are required.
