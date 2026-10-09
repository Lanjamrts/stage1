---
name: Système de Design SIGBD - DGBF
colors:
  surface: '#f8f9ff'
  surface-dim: '#cfdbef'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dde9fd'
  surface-container-highest: '#d7e3f7'
  on-surface: '#101c2b'
  on-surface-variant: '#424751'
  inverse-surface: '#253140'
  inverse-on-surface: '#eaf1ff'
  outline: '#727782'
  outline-variant: '#c2c6d3'
  surface-tint: '#1f5fa8'
  primary: '#004788'
  on-primary: '#ffffff'
  primary-container: '#1f5fa8'
  on-primary-container: '#c5daff'
  inverse-primary: '#a7c8ff'
  secondary: '#466083'
  on-secondary: '#ffffff'
  secondary-container: '#bbd6ff'
  on-secondary-container: '#435d80'
  tertiary: '#005231'
  on-tertiary: '#ffffff'
  tertiary-container: '#036d42'
  on-tertiary-container: '#93ecb6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#a7c8ff'
  on-primary-fixed: '#001c3b'
  on-primary-fixed-variant: '#004787'
  secondary-fixed: '#d3e4ff'
  secondary-fixed-dim: '#aec8f0'
  on-secondary-fixed: '#001c38'
  on-secondary-fixed-variant: '#2d486a'
  tertiary-fixed: '#9df5bf'
  tertiary-fixed-dim: '#81d8a4'
  on-tertiary-fixed: '#002111'
  on-tertiary-fixed-variant: '#005231'
  background: '#f8f9ff'
  on-background: '#101c2b'
  surface-variant: '#d7e3f7'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
  metric-num:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system embodies sovereign rigor, institutional trust, and administrative efficiency. Tailored specifically for the budgetary, fiscal, and operational workflows of the Direction Générale du Budget et des Finances (DGBF · SSEBF) under the Ministère de l'Économie et des Finances, the visual environment prioritizes clarity over ornamentation and data density over decorative whitespace.

The visual style is **Corporate / Modern** anchored in institutional sobriety. It communicates stability, legal compliance, and absolute data integrity. The UI evokes a calm, focused, and authoritative atmosphere, ensuring cognitive fatigue is minimized during prolonged sessions of financial management, audit, and budgetary reconciliation. Every screen features an institutional anchor: a persistent 4px top stripe split equally between administrative red (#B42318) on the left and civic green (#1E7B4F) on the right, providing an immutable stamp of state authority across all modules.

## Colors

The color system enforces strict compliance with WCAG AA accessibility standards across all data grids and administrative forms. 

- **Primary (`#1F5FA8`)**: The operational action blue. Used for primary buttons, active interactive states, links, and focused input halos. Interactive hover transitions use `#174C87`.
- **Secondary (`#0B2A4A`)**: The institutional deep navy. Applied to high-hierarchy structure—specifically the persistent vertical sidebar, global header bars, primary navigation tabs, and heavy table header groupings.
- **Surface & Canvas**: The base canvas is `#F5F7FA` (Page Background), providing soft contrast against `#FFFFFF` (Pure White) component containers, data cards, and modal surfaces. Structural division is maintained with `#E3E8EF` for 1px neutral borders.
- **Typography Tokens**: High-legibility text hierarchy relies on `#1A2433` for primary body copy, titles, and numerical metrics (contrast ratio > 12:1 against white), paired with `#5B6778` for labels, supporting metadata, and table column headers.
- **Functional Semantics**:
  - *Success*: `#1E7B4F` with subtle background tint `#E8F5E9` (reconciliation validation, approved budgets).
  - *Danger / Error*: `#B42318` with soft background tint `#FDECEA` (deficit alerts, validation errors, reject actions).
  - *Warning*: `#B7791F` with background `#FEF3C7` (pending approval, audit warnings).
  - *Information*: `#1F5FA8` with background `#E8F1FB` (metadata advisories, system notifications).

## Typography

The type system is built on **Inter**, optimized for data-dense user interfaces, accounting sheets, and institutional communications. 

Tabular numbers (`font-variant-numeric: tabular-nums`) must be active by default across all numerical displays, budgetary tables, balance sheets, and metric cards to guarantee vertical alignment of currencies and values. Line heights are calibrated strictly for dense form fields and dense data grids. Section headings utilize semi-bold and bold weights with subtle negative tracking for authority, while labels feature slight positive tracking in all-caps scenarios (`label-sm`) for immediate categorization.

## Layout & Spacing

The layout model is structured around a responsive **Fluid Grid** system that balances standard dashboard efficiency with heavy analytical tables.

- **Grid Architecture**: 
  - Desktop (>= 1280px): Persistent vertical navigation sidebar of 260px fixed width, coupled with a 12-column fluid content area with 24px (`gutter-desktop`) gutters and 32px (`margin-desktop`) padding.
  - Tablet (768px - 1279px): Collapsible sidebar to 64px icon rail, 8-column grid with 16px (`gutter`) gutters and 24px margins.
  - Mobile (< 768px): Drawer-based navigation, 4-column fluid layout with 16px gutters and 16px outer margins.
- **Rhythm**: All paddings and internal gaps align to a base 4px/8px rhythm. Component heights for primary interactions (form controls, filters, primary buttons) are locked at a standardized 44px to satisfy target sizing and administrative productivity.

## Elevation & Depth

To preserve an austere, functional aesthetic suitable for financial administration, depth is achieved primarily through **low-contrast outlines** paired with subtle **tonal layering**, rather than decorative drop shadows.

- **Level 0 (Base Canvas)**: Background color `#F5F7FA`. Neutral foundation with no shadow.
- **Level 1 (Card & Module Layer)**: Pure white `#FFFFFF` surface bounded by a crisp 1px solid `#E3E8EF` border. No drop shadow is used for static data cards, keeping visual clutter minimal.
- **Level 2 (Dropdowns & Contextual Menus)**: `#FFFFFF` surface, 1px `#E3E8EF` border, paired with an ultra-subtle ambient shadow: `0 4px 12px rgba(11, 42, 74, 0.06)`.
- **Level 3 (Modals & Slide-over Panels)**: Raised overlays surrounded by 1px border `#E3E8EF` and deep containment shadow: `0 12px 32px rgba(11, 42, 74, 0.12)`. Backdrop uses `#0B2A4A` set to 40% opacity.

## Shapes

The design system adopts a controlled, restrained curvature model (`roundedness: 2`).

- **Controls & Buttons**: Enforce a strict 8px radius (`rounded-md`), balancing modern software design with the seriousness of governmental tooling.
- **Cards & Data Tables**: Use 8px external perimeter rounding with internal cells having straight 0px corners to uphold structural integrity.
- **Tags & Status Badges**: Set to 4px radius (`rounded-sm`) to distinguish status chips from actionable, pill-shaped buttons. 
- **Institutional Top Stripe**: Zero radius (`0px`), running edge-to-edge as a structural horizon at the very apex of the viewport (split 50/50 horizontally between `#B42318` and `#1E7B4F`).

## Components

### Persistent Institutional Header & Stripe
- **Top Stripe**: 4px height spanning 100% of the viewport width. Divided precisely in half: left 50% colored `#B42318`, right 50% colored `#1E7B4F`.
- **Header Bar**: Direct container below the stripe using `#0B2A4A` or `#FFFFFF` (dependent on portal view), housing the official ministry seal, department acronym (DGBF · SSEBF), current fiscal year tag, and user role.

### Buttons
- **Height & Radius**: Exactly 44px height, 8px border radius, with horizontal padding of 16px (`space-md`). Text set to `label-lg`.
- **Primary**: Background `#1F5FA8`, text `#FFFFFF`, no border. Hover state `#174C87`. Active state `#133E6E`. Focus-visible ring: 2px offset with 2px solid `#1F5FA8`.
- **Secondary**: Background `#FFFFFF`, border 1px solid `#E3E8EF`, text `#1A2433`. Hover: background `#F5F7FA`, border `#CCD4E0`.
- **Destructive**: Background `#B42318`, text `#FFFFFF`. Hover: `#911C13`.
- **Icon Buttons**: 44x44px square, 8px border radius, icon size 20px centered.

### Input Fields
- **Dimensions**: Exactly 44px height, 8px border radius, padding 0 14px.
- **States**: Background `#FFFFFF`, 1px solid `#E3E8EF`, text `#1A2433` (`body-md`), placeholder `#5B6778`.
- **Focus**: Border `#1F5FA8` with a 3px outer glow ring of `rgba(31, 95, 168, 0.15)`.
- **Icon Integration**: 20px functional icons (search, calendar, currency symbol) placed at 12px inset from left/right edge; text indented accordingly.
- **Error State**: Border `#B42318`, helper text `#B42318` (`body-sm`).

### Cards & Data Panels
- **Structure**: Surface `#FFFFFF`, border 1px solid `#E3E8EF`, radius 8px, padding 20px (`space-lg`).
- **Header**: Divided by an optional 1px horizontal line `#E3E8EF`, featuring uppercase section label in `label-md` (`#5B6778`) and primary title in `headline-sm` (`#1A2433`).

### Badges & Status Chips
- **Geometry**: Height 24px, radius 4px, padding 2px 8px. Font `label-sm`.
- **Success**: Background `#E8F5E9`, text `#1E7B4F`, 1px border `rgba(30, 123, 79, 0.2)`.
- **Error / Reject**: Background `#FDECEA`, text `#B42318`, 1px border `rgba(180, 35, 24, 0.2)`.
- **Pending**: Background `#FEF3C7`, text `#B7791F`, 1px border `rgba(183, 121, 31, 0.2)`.
- **Neutral / Draft**: Background `#F5F7FA`, text `#5B6778`, 1px border `#E3E8EF`.

### Checkboxes & Radios
- **Checkbox**: 18x18px box, radius 4px, border 1.5px solid `#5B6778`. Checked state: background `#1F5FA8`, border `#1F5FA8`, checkmark `#FFFFFF`.
- **Radio**: 18x18px circular element, border 1.5px solid `#5B6778`. Checked state: border `#1F5FA8`, inner dot 8px `#1F5FA8`.

### Data Tables (Financial Grids)
- **Header**: Background `#0B2A4A` with `#FFFFFF` text, or secondary muted variant `#F5F7FA` with `#5B6778` uppercase `label-sm` text. Height 40px.
- **Rows**: Height 44px (standard) or 36px (compact view). Alternating row background: `#FFFFFF` and `#FAFCFE`. Row divider: 1px `#E3E8EF`.
- **Numeric Cells**: Right-aligned, Inter tabular-nums styling.