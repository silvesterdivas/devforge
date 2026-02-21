# GOAT Design System — DevForge

## Direction
- Archetype: Boldness & Clarity + Dark Immersive
- Tone: Commanding, precise, electric
- Differentiation: A dev command center that feels like mission control — not another generic dashboard. Terminal-green accent signals "active systems" and dev credibility.

## Typography
- Display: Space Grotesk (700, 600)
- Body: Inter (400, 500)
- Mono: JetBrains Mono (400)
- Scale: 11 / 13 / 14 / 16 / 20 / 24 / 32 / 48
- Line heights: display: 1.15, body: 1.55

## Color Tokens
- bg-primary: #09090b
- bg-surface: #131316
- bg-elevated: #1c1c22
- fg-primary: #f0f0f3
- fg-muted: #6e6e80
- accent: #00e5a0
- accent-hover: #00cc8e
- accent-dim: rgba(0, 229, 160, 0.10)
- border: #23232e
- success: #00e5a0
- warning: #f59e0b
- error: #ef4444
- focus-glow: rgba(0, 229, 160, 0.25)

### Dark Variant
(Single theme — dark only)
- bg-primary: #09090b
- bg-surface: #131316
- bg-elevated: #1c1c22
- fg-primary: #f0f0f3
- fg-muted: #6e6e80
- accent: #00e5a0
- accent-hover: #00cc8e
- border: #23232e

## Spacing
- Base unit: 4px
- Scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64

## Depth Strategy
- Approach: borders-only + selective glow
- Glow reserved for: Focus status dot, active/hover card borders, primary CTA
- Border radius: small: 4px, medium: 8px, large: 12px

## Component Patterns
- Buttons: 36px height, 13px font-size, font-weight 500, 6px radius
- Cards: 1px border, 8px radius, 20px padding
- Inputs: 36px height, 1px border, 6px radius
- Modals: 480px max-width, 12px radius
- Status dots: 8px diameter, glow for Focus status

## Stack
- Platform: Web (local dashboard)
- Styling: Vanilla CSS (CSS custom properties)
- Animation: CSS transitions only
- Component library: none
