# Azul Mobile App

React Native (Expo) Android app for controlling the Azul irrigation system. Authenticated, navigable, and ready to build on incrementally.

## Current State (May 2026)

The app **runs on Android** with a complete auth foundation:

- Login screen with Auth0 OAuth (browser-based, Google login confirmed working)
- Authenticated home screen showing user profile (name, email, avatar)
- Protected routing — unauthenticated users are always redirected to login
- Session persistence via refresh token in hardware-backed secure storage
- Sign out (local only — clears stored token without invalidating the Auth0 web session)

### Outstanding issue: "Authorize App" consent screen
Auth0 shows a consent screen on every login. Root cause: `logout()` previously called `auth0.webAuth.clearSession()` which wiped stored consent — this has been fixed. The consent screen should go away after one more accepted login. If it persists, the likely remaining fix is to also set the Azul app as **First Party** in Auth0 dashboard → Applications → Azul → Settings → scroll to bottom → set "Client Authentication" or check if "First Party" flag is available.

## Tech Stack

| Concern | Library |
|---|---|
| Framework | React Native 0.81 + Expo SDK 54 |
| Routing | expo-router 6 (file-based) |
| Auth | react-native-auth0 5 + expo-secure-store |
| State | Zustand 5 |
| Language | TypeScript (strict) |

## Directory Structure

```
app/
  _layout.tsx         Root layout — mounts AuthGuard, handles session restore + redirect
  index.tsx           Entry point — redirects to /(auth)/login
  (auth)/
    _layout.tsx       Unauthenticated stack layout
    login.tsx         Login screen — Sign In button, error display
  (app)/
    _layout.tsx       Authenticated stack layout (blue header)
    home.tsx          Home screen — user profile + controllers placeholder

services/
  auth.ts             Auth0 login/logout/refresh + ID token parser

store/
  auth.ts             Zustand store — user, accessToken, setSession, clearSession

components/           Empty — reserved for reusable UI components
hooks/                Empty — reserved for custom React hooks
```

## Auth Flow

1. On launch, `AuthGuard` (`app/_layout.tsx`) tries to restore a saved refresh token from `expo-secure-store`.
2. If found, exchanges it for a new access token and parses the ID token JWT for user info.
3. If not found, redirects to `/(auth)/login`.
4. On login, opens Auth0 browser flow. On success, saves refresh token and redirects to `/(app)/home`.
5. On sign out, deletes the local refresh token only (does NOT clear the Auth0 web session — this is intentional to avoid re-triggering consent).

User profile (name, email, picture) is extracted from the ID token JWT via `parseIdToken()` — no separate `/userinfo` call needed.

## Auth0 Configuration

| Setting | Value |
|---|---|
| Tenant | `dev-cgrr5v7lsr3wbpcj.us.auth0.com` |
| Application | `Azul` (Native/Expo) |
| Client ID | `poDGZjYkldgTern34mgX5F9XEgKhUAB0` |
| Android package | `com.anonymous.azul` |
| API | `Azul API` — audience `https://api.azul` |
| API: Allow Skipping User Consent | ON |
| API: Allow Offline Access | ON |
| App API Access | Enabled with All permissions |

**Callback URLs** (set in Auth0 → Azul app → Settings → Application URIs):
```
com.anonymous.azul.auth0://dev-cgrr5v7lsr3wbpcj.us.auth0.com/android/com.anonymous.azul/callback
```

**Credentials** in `mobile/.env.local` (gitignored):
```
EXPO_PUBLIC_AUTH0_DOMAIN=dev-cgrr5v7lsr3wbpcj.us.auth0.com
EXPO_PUBLIC_AUTH0_CLIENT_ID=poDGZjYkldgTern34mgX5F9XEgKhUAB0
```

## Prerequisites

| Tool | Notes |
|---|---|
| Android Studio (Panda 4) | SDK + emulator |
| JDK 17 (Azul Zulu) | At `/Library/Java/JavaVirtualMachines/zulu-17.jdk` |
| `adb` | Via `$ANDROID_HOME/platform-tools` |

Required `~/.zshrc` entries:
```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

> **Note:** A Salesforce-managed Java stub at `/usr/local/bin/java` intercepts the `java` command. The `$JAVA_HOME/bin` prepend to PATH overrides it. If `java -version` shows the Salesforce warning instead of the JDK version, re-run `source ~/.zshrc`.

## How to Run

**Start the emulator first** — open Android Studio → Device Manager → ▶ play on Pixel 9 (API 35).

**Build and run** (first time after a clean checkout, or after deleting `android/`):
```bash
cd mobile
source ~/.zshrc
npx expo run:android
```

**Subsequent runs** (Metro already ran once, `android/` exists):
```bash
cd mobile
npx expo run:android
```
Or if Metro is already running, press **a** to open on Android or **r** to reload.

**Stop:** Close the terminal window running Metro, then close the emulator and Android Studio.

> Expo Go **cannot** be used — `react-native-auth0` requires a native development build.

## Known Issues / Next Steps

- "Authorize App" consent screen may still appear once more on first login after today's fix — accept it and it should stop.
- Header on home screen shows "home" (lowercase) — needs a proper title.
- Android package `com.anonymous.azul` should be renamed to a production identifier before any release.
- Controllers list on home screen is a placeholder — needs backend API connection.
- Error message display on login screen is currently verbose (raw Auth0 errors) — should be cleaned up once auth is stable.
