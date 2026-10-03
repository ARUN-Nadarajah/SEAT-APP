/**
 * TypeScript does not pick up `@types/jest` automatically under this
 * project's `moduleResolution: bundler` setup, so reference it explicitly.
 * This keeps `describe` / `test` / `expect` typed in `__tests__` files
 * without narrowing `types` for the rest of the app.
 */
/// <reference types="jest" />
