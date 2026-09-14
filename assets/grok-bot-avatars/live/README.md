# x.ai live avatar extraction

Source: https://x.ai/bot
Captured: 2026-09-02

The Agent Square avatars are rendered as inline SVGs with viewBox -15 -15 259 259. The live DOM uses grok-bot-mark__head and two grok-bot-mark__eye paths.

The page does not use a standalone GIF/Lottie file for this interaction. Pointer tracking is handled by React state and writes a transform attribute on each eye path. The observed transform form is: translate(cx cy) scale(sx sy) translate(-eyeCenterX -eyeCenterY).

The pointer source is a window-level passive pointermove listener, enabled only while the avatar is intersecting the viewport. Reduced-motion is checked with prefers-reduced-motion: reduce.

Relevant implementation module captured from the page bundle: _next/static/chunks/2dnsr3mh-d8wb.js.
