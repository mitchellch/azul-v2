# Azul Style Guide

Canonical reference for colors, typography, spacing, radii, iconography, and component patterns across mobile (React Native), web (Next.js/Tailwind), and Auth0 branding.

---

## Brand Identity

| Element | Value |
|---------|-------|
| **App Name** | Azul |
| **Company Name** | Azul Devices |
| **Primary Domain** | azul-devices.com (consumer/product site) |
| **Corporate Domain** | azul-tech.com (parent entity) |
| **App Store Listing** | "Azul" by Azul Devices |
| **Tagline** | _(TBD)_ |

---

## Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| **Primary** | `#1a56db` | Buttons, active states, links, switch tracks, slider accents |
| **Primary Hover** | `#1e40af` | Web hover state (Tailwind `blue-700`) |
| **Background** | `#f0f4f8` | Page/screen background |
| **Surface** | `#ffffff` | Cards, modals, inputs |
| **Surface Muted** | `#f9fafb` | Zebra rows, column fills (Tailwind `gray-50`) |
| **Border** | `#e5e7eb` | Card/input borders (Tailwind `gray-200`) |
| **Border Subtle** | `#f3f4f6` | Dividers, section separators (Tailwind `gray-100`) |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| **Text Primary** | `#111827` | Headings, body text (Tailwind `gray-900`) |
| **Text Secondary** | `#374151` | Secondary labels (Tailwind `gray-700`) |
| **Text Tertiary** | `#6b7280` | Captions, field labels (Tailwind `gray-500`) |
| **Text Muted** | `#9ca3af` | Placeholders, disabled text (Tailwind `gray-400`) |
| **Text Faint** | `#c4c9d4` | Firmware labels, zoom hints |
| **Text On Primary** | `#ffffff` | Text on primary-colored backgrounds |

### Semantic

| Token | Hex | Usage |
|-------|-----|-------|
| **Danger** | `#dc2626` | Delete buttons, error states, DEBUG badge |
| **Danger Light** | `#fecaca` | Error backgrounds |
| **Success** | `#16a34a` | Confirmation, running status |
| **Success Light** | `#f0fdf4` | Success backgrounds |
| **Warning** | `#f59e0b` | Warnings, attention |
| **Warning Light** | `#fffbeb` | Warning backgrounds |
| **Now Indicator** | `#dc2626` | Current-time line on schedules |

### Zone Palette

Fixed color assignment per zone number — consistent across web, mobile, and schedule visualizations.

| Zone | Hex | Name |
|------|-----|------|
| 1 | `#6b7280` | Gray |
| 2 | `#ef4444` | Red |
| 3 | `#f97316` | Orange |
| 4 | `#eab308` | Yellow |
| 5 | `#22c55e` | Green |
| 6 | `#3b82f6` | Blue |
| 7 | `#6366f1` | Indigo |
| 8 | `#a855f7` | Purple |

---

## Typography

### Font Family

- **Mobile:** System default (San Francisco on iOS, Roboto on Android)
- **Web:** System stack — `font-sans` (Inter/system-ui)
- **Auth0:** Match with "Inter" or "System Default" in Branding settings

### Type Scale

| Name | Mobile (px) | Web (Tailwind) | Weight | Usage |
|------|-------------|----------------|--------|-------|
| **Display** | 28 | `text-2xl` | 700 | Duration value display |
| **Title** | 17 | `text-lg` | 700 | Screen/tab titles, modal titles |
| **Headline** | 16 | `text-base` | 600 | Card titles, schedule names |
| **Body** | 15 | `text-sm` | 400–500 | Input text, body content |
| **Subtext** | 13–14 | `text-sm` | 500 | Secondary info, run summaries |
| **Caption** | 12 | `text-xs` | 500–600 | Field labels, day buttons, badges |
| **Micro** | 10–11 | `text-[10px]`–`text-[11px]` | 600–700 | DEBUG badge, firmware label, chart labels |

### Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| Light | 300 | Plus (+) icons only |
| Regular | 400 | Body text (rare — most body uses 500) |
| Medium | 500 | Body, secondary labels |
| Semibold | 600 | Most UI text — buttons, labels, chips |
| Bold | 700 | Titles, duration displays, active states |

---

## Spacing

Consistent spacing values used across the system.

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight gaps (legend items, inline badges) |
| `sm` | 8px | Standard element gap, chip padding |
| `md` | 12px | Card padding, section margins |
| `lg` | 16px | Screen padding (standard for all list/tab screens), card margins |
| `xl` | 20px | Modal padding, modal content spacing |
| `2xl` | 24px | Major section spacing |
| `3xl` | 32px | Content container padding-bottom |

---

## Border Radius

| Token | Mobile (px) | Web (Tailwind) | Usage |
|-------|-------------|----------------|-------|
| `sm` | 4 | `rounded` | Small chips, badges |
| `md` | 8 | `rounded-lg` | Inputs, buttons, day pills |
| `lg` | 10 | `rounded-xl` | Cards, schedule panels |
| `xl` | 12–14 | `rounded-xl` | Modals, popover cards |
| `full` | 50% | `rounded-full` | Avatars, status dots, toggle pills |

---

## Shadows

| Usage | Mobile | Web (Tailwind) |
|-------|--------|----------------|
| Card | `shadowOpacity: 0.05, shadowRadius: 4` | `shadow-sm` |
| Card hover | — | `shadow-md` |
| Modal/Popover | `shadowOpacity: 0.15, shadowRadius: 12` | `shadow-lg` |
| Toggle segment | `shadowOpacity: 0.08, shadowRadius: 2` | — |

---

## Components

### Buttons

| Variant | Background | Text | Radius | Height |
|---------|-----------|------|--------|--------|
| Primary | `#1a56db` | White | `md` (8) | 44px tap target |
| Primary Disabled | `#1a56db` @ 40% opacity | White | `md` | — |
| Danger | `#dc2626` | White | `md` | — |
| Ghost/Link | Transparent | `#1a56db` | — | — |
| Outline | White, 1px `#e5e7eb` border | `#6b7280` | `md` | — |

### Inputs

- Background: `#ffffff`
- Border: 1px `#e5e7eb`
- Border radius: 8px / `rounded-lg`
- Padding: 10–12px
- Font size: 15px / `text-sm`
- Placeholder color: `#9ca3af`

### Cards

- Background: `#ffffff`
- Border: 1px `#e5e7eb` (or none with shadow)
- Border radius: 10px / `rounded-xl`
- Padding: 14–16px
- Active/selected border: `#1a56db`

### Toggle Switch

- Track active: `#1a56db`
- Track inactive: system default
- Used for schedule enable/disable

### Badges

| Type | Background | Text | Radius |
|------|-----------|------|--------|
| DEBUG | `#dc2626` | White, 10px, 700 | 4px |
| Status Running | `#dcfce7` | `#16a34a` | full |
| Status Enabled | `#eff6ff` | `#3b82f6` | full |
| Status Disabled | `#f3f4f6` | `#9ca3af` | full |

---

## Iconography

Currently using text-based symbols (no icon library):

| Symbol | Usage |
|--------|-------|
| `‹` | Back navigation |
| `+` (26px, weight 300) | Add/create |
| `›` | Chevron/disclosure |
| `▾` / `▸` | Collapse/expand toggle |
| `🗑` | Delete (swipe action) |
| `✓` | Selected item in picker |
| `●` / `○` | Active/inactive status |

**Future:** Consider adopting [Lucide](https://lucide.dev) for both platforms (available as `lucide-react` for web and `lucide-react-native` for mobile) when the icon set outgrows text characters.

---

## Auth0 Branding Configuration

Apply in **Auth0 Dashboard → Branding → Universal Login**:

| Setting | Value |
|---------|-------|
| Logo | Azul logo (blue on white, or white on transparent) |
| Primary Color | `#1a56db` |
| Page Background | `#f0f4f8` |
| Font | Inter (or System Default) |
| Button Border Radius | 8px |
| Widget Border Radius | 12px |

---

## Dark Mode (Future)

Not currently implemented. When added:

| Token | Light | Dark |
|-------|-------|------|
| Background | `#f0f4f8` | `#111827` |
| Surface | `#ffffff` | `#1f2937` |
| Border | `#e5e7eb` | `#374151` |
| Text Primary | `#111827` | `#f9fafb` |
| Text Secondary | `#374151` | `#d1d5db` |
| Primary | `#1a56db` | `#3b82f6` (lighter for contrast) |
