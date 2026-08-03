import type { FormField } from "../formMapper";

export const auditedFieldPrimitiveFields: FormField[] = [
  {
    type: "datetime",
    name: "startsAt",
    path: "startsAt",
    label: "Starts at",
    min: "2026-01-01T00:00:00Z",
    max: "2027-01-01T00:00:00Z",
    filterable: true,
    sortable: true,
  },
  {
    type: "multiselect",
    name: "skills",
    path: "skills",
    label: "Skills",
    min: 1,
    max: 3,
    options: {
      strategy: "Strategy",
      design: "Design",
      engineering: "Engineering",
    },
  },
  {
    type: "reference",
    name: "registrationForm",
    path: "registrationForm",
    label: "Registration form",
    target: "form",
    "x-ui": {
      references: [
        {
          uuid: "018f5f72-6ca7-7a25-8e33-ae7bcb90612b",
          label: "Annual summit registration",
        },
        {
          uuid: "018f5f72-6ca7-7a25-8e33-ae7bcb90612c",
          label: "Workshop registration",
        },
      ],
    },
  },
  {
    type: "variant",
    name: "registration",
    path: "registration",
    label: "Registration mode",
    discriminator: "mode",
    variants: {
      external: [{ type: "input", name: "url", label: "Registration URL" }],
      form: [
        { type: "reference", name: "form", label: "Form", target: "form" },
      ],
      none: [],
    },
  },
  {
    type: "pods",
    name: "speakers",
    path: "speakers",
    label: "Speakers",
    pod_whitelist: ["speaker-card"],
    pod_contracts: {
      "speaker-card": {
        fields: [
          { type: "input", name: "name", label: "Name" },
          { type: "input", name: "role", label: "Role" },
        ],
      },
    },
  },
];

export const auditedFieldPrimitiveFixture = {
  startsAt: "2026-10-15T14:30:00-04:00",
  skills: ["strategy", "design"],
  registrationForm: {
    type: "form",
    uuid: "018f5f72-6ca7-7a25-8e33-ae7bcb90612b",
  },
  registration: {
    mode: "external",
    url: "https://example.test/register",
  },
  speakers: [
    {
      _uid: "01JAZ6G1YQ2V5TQ4M8E9R7K3HC",
      pod_slug: "speaker-card",
      props: { name: "Ada Rivera", role: "Design systems lead" },
    },
    {
      _uid: "01JAZ6G2BAGH4K7H3VZQ09XWPD",
      pod_slug: "speaker-card",
      props: { name: "Malik Chen", role: "Platform architect" },
    },
  ],
} satisfies Record<string, unknown>;

export const auditedFieldPrimitiveInvalidFixtures = {
  floatingDatetime: {
    ...auditedFieldPrimitiveFixture,
    startsAt: "2026-10-15T14:30",
  },
  duplicateMultiselect: {
    ...auditedFieldPrimitiveFixture,
    skills: ["design", "design"],
  },
  unknownMultiselect: { ...auditedFieldPrimitiveFixture, skills: ["unknown"] },
  bareReference: { ...auditedFieldPrimitiveFixture, registrationForm: 5 },
  mismatchedReference: {
    ...auditedFieldPrimitiveFixture,
    registrationForm: {
      type: "page",
      uuid: "018f5f72-6ca7-7a25-8e33-ae7bcb90612b",
    },
  },
  inactiveVariant: {
    ...auditedFieldPrimitiveFixture,
    registration: {
      mode: "external",
      url: "https://example.test/register",
      form: { type: "form", uuid: "018f5f72-6ca7-7a25-8e33-ae7bcb90612b" },
    },
  },
  unwhitelistedPod: {
    ...auditedFieldPrimitiveFixture,
    speakers: [
      { _uid: "01JAZ6G1YQ2V5TQ4M8E9R7K3HC", pod_slug: "hero", props: {} },
    ],
  },
} satisfies Record<string, Record<string, unknown>>;
