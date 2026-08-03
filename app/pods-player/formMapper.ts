/**
 * pods-playground-layer/app/pods-player/formMapper.ts
 *
 * Dot-path mapping between YAML form fields and a nested props payload.
 *
 * This is promoted from the `cms-story-components` playground, but implemented
 * without extra dependencies so both host apps can share it.
 */

import { normalizeAuditedFieldValue } from "./fieldPrimitives";

export interface FormField {
  /**
   * Leaf fields must have a name. Layout primitives (group/row) may omit it.
   */
  name?: string;
  path?: string;
  type: string;
  aliases?: string[];
  children?: FormField[];
  fields?: FormField[];
  fixture?: unknown;
  default?: unknown;
  responsive?: boolean;
  value?: { desktop?: unknown; tablet?: unknown; phone?: unknown };
  when?:
    | { field: string; equals: unknown }
    | Array<{ field: string; equals: unknown }>;
  [key: string]: unknown;
}

function matchesWhen(
  when: FormField["when"],
  model: Record<string, unknown>,
): boolean {
  if (!when) return true;
  const conditions = Array.isArray(when) ? when : [when];
  return conditions.every(
    (condition) => dotGet(model, condition.field) === condition.equals,
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function dotGet(obj: unknown, path: string): unknown {
  if (!isRecord(obj)) return undefined;
  if (!path) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (!isRecord(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function dotSet(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".").filter(Boolean);
  const leaf = parts.at(-1);
  if (!leaf) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!key) continue;
    const next = cur[key];
    if (!isRecord(next)) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[leaf] = value;
}

function isUiOnlyGroupName(name: string | undefined): boolean {
  return !!name && name.startsWith("__");
}

function joinPath(prefix: string, next: string): string {
  if (!prefix) return next;
  return `${prefix}.${next}`;
}

function fieldAliases(field: FormField): string[] {
  const directAliases = Array.isArray(field.aliases) ? field.aliases : [];
  const compat = isRecord(field["x-compat"]) ? field["x-compat"] : {};
  const compatAliases = Array.isArray(compat.aliases) ? compat.aliases : [];

  return [...directAliases, ...compatAliases]
    .filter(
      (alias): alias is string =>
        typeof alias === "string" && alias.trim() !== "",
    )
    .map((alias) => alias.trim());
}

function fieldValue(
  field: FormField,
  fixture: Record<string, unknown>,
  rootFixture: Record<string, unknown>,
  path: string,
  explicitPathsAreAbsolute: boolean,
): unknown {
  const source = field.path && explicitPathsAreAbsolute ? rootFixture : fixture;
  const value = dotGet(source, path);

  if (value !== undefined) {
    return value;
  }

  for (const alias of fieldAliases(field)) {
    const aliasValue = dotGet(rootFixture, alias);

    if (aliasValue !== undefined) {
      return aliasValue;
    }

    if (!explicitPathsAreAbsolute) {
      const localAliasValue = dotGet(fixture, alias);

      if (localAliasValue !== undefined) {
        return localAliasValue;
      }
    }
  }

  return undefined;
}

function hasFixtureValue(
  field: FormField,
  fixture: Record<string, unknown>,
  pathPrefix: string = "",
  rootFixture: Record<string, unknown> = fixture,
  explicitPathsAreAbsolute: boolean = true,
): boolean {
  if (field.type === "group" && field.children) {
    const groupName = field.name;
    if (groupName && !isUiOnlyGroupName(groupName)) {
      const provided = dotGet(fixture, groupName);
      if (isRecord(provided) && Object.keys(provided).length > 0) return true;
      const nestedFixture = {
        ...(isRecord(field.fixture) ? field.fixture : {}),
        ...(isRecord(provided) ? provided : {}),
      };
      return field.children.some((child) =>
        hasFixtureValue(
          child,
          nestedFixture,
          "",
          rootFixture,
          explicitPathsAreAbsolute,
        ),
      );
    }

    const nextPrefix =
      groupName && !isUiOnlyGroupName(groupName)
        ? joinPath(pathPrefix, groupName)
        : pathPrefix;
    return field.children.some((child) =>
      hasFixtureValue(
        child,
        fixture,
        nextPrefix,
        rootFixture,
        explicitPathsAreAbsolute,
      ),
    );
  }

  if (field.type === "row" && field.fields) {
    return field.fields.some((child) =>
      hasFixtureValue(
        child,
        fixture,
        pathPrefix,
        rootFixture,
        explicitPathsAreAbsolute,
      ),
    );
  }

  if (field.type === "repeater" && field.fields && field.name) {
    const listPath = field.path || joinPath(pathPrefix, field.name);
    const provided = dotGet(fixture, listPath);
    return Array.isArray(provided) && provided.length > 0;
  }

  if (!field.name) return false;
  const path = field.path || joinPath(pathPrefix, field.name);
  const value = fieldValue(
    field,
    fixture,
    rootFixture,
    path,
    explicitPathsAreAbsolute,
  );
  return value !== undefined;
}

export function flatFromFixture(
  fields: FormField[],
  fixture: Record<string, unknown>,
  pathPrefix: string = "",
  rootFixture: Record<string, unknown> = fixture,
  explicitPathsAreAbsolute: boolean = true,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};

  for (const field of fields) {
    if (
      !matchesWhen(field.when, flat) &&
      !hasFixtureValue(
        field,
        fixture,
        pathPrefix,
        rootFixture,
        explicitPathsAreAbsolute,
      )
    )
      continue;

    if (field.type === "group" && field.children) {
      const groupName = field.name;
      if (groupName && !isUiOnlyGroupName(groupName)) {
        const provided = dotGet(fixture, groupName) as
          | Record<string, unknown>
          | undefined;
        const nestedFixture = {
          ...(isRecord(field.fixture) ? field.fixture : {}),
          ...(provided ?? {}),
        };
        flat[groupName] = flatFromFixture(
          field.children,
          nestedFixture,
          "",
          rootFixture,
          explicitPathsAreAbsolute,
        );
      } else {
        const nextPrefix =
          groupName && !isUiOnlyGroupName(groupName)
            ? joinPath(pathPrefix, groupName)
            : pathPrefix;
        Object.assign(
          flat,
          flatFromFixture(
            field.children,
            fixture,
            nextPrefix,
            rootFixture,
            explicitPathsAreAbsolute,
          ),
        );
      }
      continue;
    }

    if (field.type === "row" && field.fields) {
      const parentFixture = pathPrefix
        ? (dotGet(fixture, pathPrefix) as Record<string, unknown> | undefined)
        : isRecord(fixture)
          ? fixture
          : {};
      const transformedFixture: Record<string, unknown> = {
        ...(isRecord(field.fixture) ? field.fixture : {}),
        ...(parentFixture ?? {}),
      };
      const rowFlat = flatFromFixture(
        field.fields,
        transformedFixture,
        "",
        rootFixture,
        explicitPathsAreAbsolute,
      );
      Object.assign(flat, rowFlat);
      continue;
    }

    if (field.type === "repeater" && field.fields) {
      if (!field.name) continue;
      const listPath = field.path || joinPath(pathPrefix, field.name);
      const provided = dotGet(fixture, listPath) as unknown[] | undefined;
      if (Array.isArray(provided) && provided.length > 0) {
        flat[field.name] = provided.map((item) =>
          flatFromFixture(
            field.fields!,
            (item ?? {}) as Record<string, unknown>,
            "",
            (item ?? {}) as Record<string, unknown>,
            false,
          ),
        );
      } else if (field.default !== undefined) {
        flat[field.name] = field.default;
      } else {
        flat[field.name] = [];
      }
      continue;
    }

    // leaf
    if (!field.name) continue;
    const fieldKey = field.name;

    if (field.responsive) {
      const path = field.path || joinPath(pathPrefix, fieldKey);
      const value = fieldValue(
        field,
        fixture,
        rootFixture,
        path,
        explicitPathsAreAbsolute,
      );
      if (value !== undefined && isRecord(value)) {
        flat[field.name] = value;
      } else if (isRecord(field.fixture)) {
        flat[field.name] = field.fixture;
      } else if (field.value) {
        flat[field.name] = field.value;
      } else {
        flat[field.name] = {
          desktop: field.default ?? "",
          tablet: field.default ?? "",
          phone: field.default ?? "",
        };
      }
      continue;
    }

    const path = field.path || joinPath(pathPrefix, fieldKey);
    const value = fieldValue(
      field,
      fixture,
      rootFixture,
      path,
      explicitPathsAreAbsolute,
    );

    if (value !== undefined) {
      flat[field.name] = field.type === "number" ? Number(value) : value;
    } else if (field.fixture !== undefined) {
      flat[field.name] =
        field.type === "number" ? Number(field.fixture) : field.fixture;
    } else if (field.default !== undefined) {
      flat[field.name] =
        field.type === "number" ? Number(field.default) : field.default;
    } else if (field.type === "toggle") {
      flat[field.name] = false;
    } else if (field.type === "repeater") {
      flat[field.name] = [];
    } else if (field.type === "input") {
      flat[field.name] = "";
    }
  }

  return flat;
}

export function rebuildPayload(
  fields: FormField[],
  flat: Record<string, unknown>,
  pathPrefix: string = "",
  explicitPathsAreAbsolute: boolean = true,
): Record<string, unknown> {
  const nested: Record<string, unknown> = {};
  rebuildIntoPayload(
    fields,
    flat,
    nested,
    pathPrefix,
    explicitPathsAreAbsolute,
  );
  return nested;
}

function rebuildIntoPayload(
  fields: FormField[],
  flat: Record<string, unknown>,
  target: Record<string, unknown>,
  pathPrefix: string = "",
  explicitPathsAreAbsolute: boolean = true,
) {
  for (const field of fields) {
    if (!matchesWhen(field.when, flat)) continue;

    if (field.type === "group" && field.children) {
      if (field.name && !isUiOnlyGroupName(field.name)) {
        const value = flat[field.name] as Record<string, unknown> | undefined;
        if (value) {
          const nextPrefix = field.path || joinPath(pathPrefix, field.name);
          rebuildIntoPayload(
            field.children,
            value,
            target,
            nextPrefix,
            explicitPathsAreAbsolute,
          );
        }
      } else {
        const groupName = field.name;
        const nextPrefix =
          groupName && !isUiOnlyGroupName(groupName)
            ? joinPath(pathPrefix, groupName)
            : pathPrefix;
        rebuildIntoPayload(
          field.children,
          flat,
          target,
          nextPrefix,
          explicitPathsAreAbsolute,
        );
      }
      continue;
    }

    if (field.type === "row" && field.fields) {
      for (const rowField of field.fields) {
        if (!rowField.name) continue;
        if (!matchesWhen(rowField.when, flat)) continue;
        if (flat[rowField.name] !== undefined) {
          const path =
            rowField.path && explicitPathsAreAbsolute
              ? rowField.path
              : rowField.path || joinPath(pathPrefix, rowField.name);
          dotSet(target, path, flat[rowField.name]);
        }
      }
      continue;
    }

    if (field.type === "repeater" && field.fields) {
      if (!field.name) continue;
      const value = flat[field.name] as unknown[];
      if (Array.isArray(value)) {
        const nestedRepeater = value.map((item) =>
          rebuildPayload(
            field.fields!,
            (item ?? {}) as Record<string, unknown>,
            "",
            false,
          ),
        );
        const listPath = field.path || joinPath(pathPrefix, field.name);
        dotSet(target, listPath, nestedRepeater);
      }
      continue;
    }

    if (!field.name) continue;
    const path =
      field.path && explicitPathsAreAbsolute
        ? field.path
        : field.path || joinPath(pathPrefix, field.name);
    if (flat[field.name] !== undefined) {
      dotSet(
        target,
        path,
        normalizeAuditedFieldValue(field, flat[field.name], { path }),
      );
    }
  }
}
