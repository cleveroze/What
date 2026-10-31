// Types for workshop-core.js (shared with the Stride app).
import type { ExtensionBundle } from "../../src/extensions/types";

export const OWNER: string;
export const REPO: string;
export const SITE: string;
export const PERMISSIONS: Record<string, string>;
export const MAX_BUNDLE_CHARS: number;
export function validateBundle(bundle: unknown, options?: { shapeNames?: readonly string[] }): { errors: string[]; warnings: string[] };
export function compareVersions(a: string, b: string): number;
export function submissionUrl(bundle: ExtensionBundle): { url: string; prefilled: boolean; json: string };
