# Motion Core

## Target Signal

Represent the visual target with page-local data containing x, y, visible, velocityX, and velocityY.

x and y are viewport CSS pixels. Velocity is optional unless direction or catch-up speed depends on it. Use a local event, hook, composable, or callback; do not introduce global state for a page-only effect.

## Mapping

1. Measure the observer center from rendered bounds.
2. Normalize each target offset into the range from -1 to 1 using an explicit tracking range.
3. Map normalized values to bounded yaw, pitch, and eye displacement.
4. Smooth current values toward targets with frame-rate-independent damping.

Keep horizontal turning around the vertical axis. Vertical movement may produce a small bounded pitch. Never add roll for ordinary pointer tracking, and never accumulate angles across frames.

Use shortest-path turning when a 3D subject changes left or right direction. Catch-up speed may increase with distance, but cap it so a fast pointer does not create teleporting or oscillation.

## Ownership

Separate three responsibilities:

- Target producer: pointer, follower object, or another animated subject.
- Motion calculation: pure functions for normalization, clamping, damping, and direction.
- Renderer: CSS transforms, canvas, or Three.js objects.

Test motion calculation without mounting the framework component.

## Lifecycle

Register pointer listeners and animation frames only while the target page is mounted. On cleanup, remove listeners, cancel animation frames, clear blink timers, and publish an invisible target state when observers need to return to neutral.
