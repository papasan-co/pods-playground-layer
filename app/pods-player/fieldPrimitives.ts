import type { FormField } from "./formMapper";

export const AUDITED_FIELD_PRIMITIVE_TYPES = [
  "datetime",
  "multiselect",
  "reference",
  "variant",
  "pods",
] as const;

export const RENDERABLE_FIELD_PRIMITIVE_TYPES = [
  "background-color",
  "brand-color-picker",
  "color-select",
  "datetime",
  "geopoint",
  "group",
  "icon-source",
  "input",
  "input-number",
  "medias",
  "multiselect",
  "number",
  "pods",
  "position-grid",
  "reference",
  "repeater",
  "rich-text",
  "row",
  "select",
  "slider",
  "textarea",
  "toggle",
  "variant",
  "wysiwyg",
] as const;

export type AuditedFieldPrimitiveType =
  (typeof AUDITED_FIELD_PRIMITIVE_TYPES)[number];
export type ReferenceTarget = "page" | "collection-entry" | "form" | "media";
export type TypedReference = { type: ReferenceTarget; uuid: string };
export type NestedPodValue = {
  _uid: string;
  pod_slug: string;
  props: Record<string, unknown>;
};

export class FieldPrimitiveValueError extends Error {
  readonly code = "invalid_field_primitive_value";

  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "FieldPrimitiveValueError";
  }
}

type NormalizeContext = {
  path?: string;
  structuralDepth?: number;
  podTrail?: string[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const REFERENCE_TARGETS = new Set<ReferenceTarget>([
  "page",
  "collection-entry",
  "form",
  "media",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function primitivePath(field: FormField, context: NormalizeContext): string {
  return context.path || field.path || field.name || "<field>";
}

function fieldOptions(field: FormField): string[] {
  return isRecord(field.options) ? Object.keys(field.options) : [];
}

function structuralDepth(context: NormalizeContext, path: string): number {
  const depth = (context.structuralDepth ?? 0) + 1;
  if (depth > 2) {
    throw new FieldPrimitiveValueError(
      path,
      "serialization_depth exceeds the maximum of two structural levels",
    );
  }
  return depth;
}

function normalizeDatetime(
  field: FormField,
  value: unknown,
  path: string,
): string {
  if (
    typeof value !== "string" ||
    !RFC3339_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new FieldPrimitiveValueError(
      path,
      "expected an offset-bearing RFC 3339 timestamp",
    );
  }

  const instant = Date.parse(value);
  for (const [key, comparison] of [
    ["min", (bound: number) => instant < bound],
    ["max", (bound: number) => instant > bound],
  ] as const) {
    const rawBound = field[key];
    if (typeof rawBound !== "string" || !RFC3339_PATTERN.test(rawBound))
      continue;
    if (comparison(Date.parse(rawBound))) {
      throw new FieldPrimitiveValueError(
        path,
        `timestamp violates ${key}=${rawBound}`,
      );
    }
  }

  return value;
}

function normalizeMultiselect(
  field: FormField,
  value: unknown,
  path: string,
): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new FieldPrimitiveValueError(
      path,
      "expected an array of option strings",
    );
  }

  const options = new Set(fieldOptions(field));
  if (options.size === 0) {
    throw new FieldPrimitiveValueError(
      path,
      "multiselect requires a non-empty options map",
    );
  }
  if (new Set(value).size !== value.length) {
    throw new FieldPrimitiveValueError(
      path,
      "duplicate multiselect values are not allowed",
    );
  }

  const unknown = value.find((item) => !options.has(item));
  if (unknown) {
    throw new FieldPrimitiveValueError(
      path,
      `unknown multiselect option "${unknown}"`,
    );
  }

  const min = typeof field.min === "number" ? field.min : undefined;
  const max = typeof field.max === "number" ? field.max : undefined;
  if (min !== undefined && value.length < min) {
    throw new FieldPrimitiveValueError(
      path,
      `requires at least ${min} selections`,
    );
  }
  if (max !== undefined && value.length > max) {
    throw new FieldPrimitiveValueError(
      path,
      `allows at most ${max} selections`,
    );
  }

  return [...value];
}

function normalizeReference(
  field: FormField,
  value: unknown,
  path: string,
): TypedReference {
  const target = field.target;
  if (
    typeof target !== "string" ||
    !REFERENCE_TARGETS.has(target as ReferenceTarget)
  ) {
    throw new FieldPrimitiveValueError(
      path,
      "reference requires target page, collection-entry, form, or media",
    );
  }
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["type", "uuid"].includes(key))
  ) {
    throw new FieldPrimitiveValueError(
      path,
      "expected exactly { type, uuid }; bare ids are forbidden",
    );
  }
  if (value.type !== target) {
    throw new FieldPrimitiveValueError(
      path,
      `reference type must match target "${target}"`,
    );
  }
  if (typeof value.uuid !== "string" || !UUID_PATTERN.test(value.uuid)) {
    throw new FieldPrimitiveValueError(path, "reference uuid must be a UUID");
  }

  return { type: target as ReferenceTarget, uuid: value.uuid };
}

function branchFields(
  field: FormField,
  discriminatorValue: string,
): FormField[] {
  const variants = isRecord(field.variants) ? field.variants : {};
  const branch = variants[discriminatorValue];
  return Array.isArray(branch) ? (branch.filter(isRecord) as FormField[]) : [];
}

function valueAtPath(value: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (current, part) => (isRecord(current) ? current[part] : undefined),
      value,
    );
}

function setValueAtPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  const leaf = parts.at(-1);
  if (!leaf) return;
  let current = target;
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(current[part])) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[leaf] = value;
}

function normalizeObjectFields(
  fields: FormField[],
  value: Record<string, unknown>,
  context: NormalizeContext,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const child of fields) {
    if (!child.name) continue;
    const relativePath = child.path || child.name;
    const childValue = valueAtPath(value, relativePath);
    if (childValue === undefined) continue;
    setValueAtPath(
      output,
      relativePath,
      normalizeAuditedFieldValue(child, childValue, {
        ...context,
        path: `${context.path}.${relativePath}`,
      }),
    );
  }
  return output;
}

function normalizeVariant(
  field: FormField,
  value: unknown,
  context: NormalizeContext,
): Record<string, unknown> {
  const path = primitivePath(field, context);
  const depth = structuralDepth(context, path);
  const discriminator = field.discriminator;
  const variants = isRecord(field.variants) ? field.variants : {};
  if (
    typeof discriminator !== "string" ||
    discriminator.trim() === "" ||
    Object.keys(variants).length === 0
  ) {
    throw new FieldPrimitiveValueError(
      path,
      "variant requires a discriminator and non-empty variants map",
    );
  }
  if (!isRecord(value) || typeof value[discriminator] !== "string") {
    throw new FieldPrimitiveValueError(
      path,
      `variant requires string discriminator "${discriminator}"`,
    );
  }

  const active = String(value[discriminator]);
  if (!Array.isArray(variants[active])) {
    throw new FieldPrimitiveValueError(
      path,
      `unknown variant branch "${active}"`,
    );
  }

  return {
    [discriminator]: active,
    ...normalizeObjectFields(branchFields(field, active), value, {
      ...context,
      path,
      structuralDepth: depth,
    }),
  };
}

function normalizePods(
  field: FormField,
  value: unknown,
  context: NormalizeContext,
): NestedPodValue[] {
  const path = primitivePath(field, context);
  const depth = structuralDepth(context, path);
  const whitelist = Array.isArray(field.pod_whitelist)
    ? field.pod_whitelist.filter(
        (slug): slug is string => typeof slug === "string" && slug !== "",
      )
    : [];
  if (whitelist.length === 0) {
    throw new FieldPrimitiveValueError(
      path,
      "pods requires a non-empty pod_whitelist",
    );
  }
  if (!Array.isArray(value)) {
    throw new FieldPrimitiveValueError(path, "pods value must be an array");
  }

  const contracts = isRecord(field.pod_contracts) ? field.pod_contracts : {};
  const seen = new Set<string>();
  return value.map((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item))
      throw new FieldPrimitiveValueError(
        itemPath,
        "pod item must be an object",
      );
    if (
      typeof item._uid !== "string" ||
      !ULID_PATTERN.test(item._uid) ||
      seen.has(item._uid)
    ) {
      throw new FieldPrimitiveValueError(
        `${itemPath}._uid`,
        "pod item requires a unique stable ULID",
      );
    }
    seen.add(item._uid);
    if (
      typeof item.pod_slug !== "string" ||
      !whitelist.includes(item.pod_slug)
    ) {
      throw new FieldPrimitiveValueError(
        `${itemPath}.pod_slug`,
        "pod slug is not whitelisted",
      );
    }
    if ((context.podTrail ?? []).includes(item.pod_slug)) {
      throw new FieldPrimitiveValueError(
        itemPath,
        `child pod cycle detected at "${item.pod_slug}"`,
      );
    }
    if (!isRecord(item.props)) {
      throw new FieldPrimitiveValueError(
        `${itemPath}.props`,
        "child pod props must be an object",
      );
    }

    const candidateContract = contracts[item.pod_slug];
    const contract = isRecord(candidateContract) ? candidateContract : null;
    const contractFields =
      contract && Array.isArray(contract.fields)
        ? (contract.fields.filter(isRecord) as FormField[])
        : [];
    const props =
      contractFields.length > 0
        ? normalizeObjectFields(contractFields, item.props, {
            path: `${itemPath}.props`,
            structuralDepth: depth,
            podTrail: [...(context.podTrail ?? []), item.pod_slug],
          })
        : { ...item.props };

    return { _uid: item._uid, pod_slug: item.pod_slug, props };
  });
}

export function normalizeAuditedFieldValue(
  field: FormField,
  value: unknown,
  context: NormalizeContext = {},
): unknown {
  const path = primitivePath(field, context);
  if (field.type === "datetime") return normalizeDatetime(field, value, path);
  if (field.type === "multiselect")
    return normalizeMultiselect(field, value, path);
  if (field.type === "reference") return normalizeReference(field, value, path);
  if (field.type === "variant") return normalizeVariant(field, value, context);
  if (field.type === "pods") return normalizePods(field, value, context);
  return value;
}

export function datetimeInputValue(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function datetimeFromInput(value: string): string {
  const date = new Date(value);
  if (value === "" || Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  const offsetMinutes = date.getTimezoneOffset();
  const offsetSign = offsetMinutes <= 0 ? "+" : "-";
  const offset = Math.abs(offsetMinutes);

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `${offsetSign}${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`,
  ].join("");
}

export function activeVariantFields(
  field: FormField,
  value: unknown,
): FormField[] {
  if (!isRecord(value) || typeof field.discriminator !== "string") return [];
  const active = value[field.discriminator];
  return typeof active === "string" ? branchFields(field, active) : [];
}

export function auditedRendererRegistration(): Record<
  AuditedFieldPrimitiveType,
  true
> {
  return Object.fromEntries(
    AUDITED_FIELD_PRIMITIVE_TYPES.map((type) => [type, true]),
  ) as Record<AuditedFieldPrimitiveType, true>;
}

export function renderableRendererRegistration(): Record<string, true> {
  return Object.fromEntries(
    RENDERABLE_FIELD_PRIMITIVE_TYPES.map((type) => [type, true]),
  );
}
