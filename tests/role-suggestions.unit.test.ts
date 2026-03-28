import { describe, expect, it } from "vitest";

import { getEffectiveMetadata, suggestImportance, suggestRole } from "../src/role-suggestions.js";
import type { Note, Relationship } from "../src/storage.js";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? "note-1",
    title: overrides.title ?? "Untitled",
    content: overrides.content ?? "Body",
    tags: overrides.tags ?? [],
    lifecycle: overrides.lifecycle ?? "permanent",
    relatedTo: overrides.relatedTo ?? [],
    createdAt: overrides.createdAt ?? "2026-03-20T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-20T10:00:00.000Z",
    role: overrides.role,
    importance: overrides.importance,
    alwaysLoad: overrides.alwaysLoad,
    project: overrides.project,
    projectName: overrides.projectName,
    memoryVersion: overrides.memoryVersion,
  };
}

function rel(id: string, type: Relationship["type"]): Relationship {
  return { id, type };
}

describe("role suggestions", () => {
  it("gives explicit metadata precedence over suggestions", () => {
    const note = makeNote({
      role: "reference",
      importance: "low",
      alwaysLoad: false,
      content: "# Vista\n- Uno\n- Dos\n# Estado\n- Tres\n- Cuatro",
      relatedTo: [rel("a", "explains"), rel("b", "explains")],
    });

    const result = getEffectiveMetadata(note, {
      inboundReferences: 6,
      linkedByPermanentNotes: 4,
      anchorCandidate: true,
    });

    expect(result.role).toBe("reference");
    expect(result.roleSource).toBe("explicit");
    expect(result.importance).toBe("low");
    expect(result.importanceSource).toBe("explicit");
    expect(result.alwaysLoad).toBe(false);
    expect(result.alwaysLoadSource).toBe("explicit");
  });

  it("does not compute suggestions when explicit role and importance already exist", () => {
    const note = makeNote({
      role: "reference",
      importance: "low",
      alwaysLoad: false,
    });
    Object.defineProperty(note, "content", {
      get() {
        throw new Error("content should not be read for explicit role/importance");
      },
    });

    const result = getEffectiveMetadata(note, {
      inboundReferences: 10,
      linkedByPermanentNotes: 10,
      anchorCandidate: true,
    });

    expect(result).toMatchObject({
      role: "reference",
      roleSource: "explicit",
      importance: "low",
      importanceSource: "explicit",
      alwaysLoad: false,
      alwaysLoadSource: "explicit",
    });
  });

  it("never infers alwaysLoad", () => {
    const note = makeNote({
      content: "# Vista\n- Uno\n- Dos\n# Estado\n- Tres\n- Cuatro",
    });

    const result = getEffectiveMetadata(note, {
      inboundReferences: 8,
      linkedByPermanentNotes: 5,
      anchorCandidate: true,
    });

    expect(result.alwaysLoad).toBeUndefined();
    expect(result.alwaysLoadSource).toBe("none");
  });

  it("reports suggested provenance when inference supplies role and importance", () => {
    const note = makeNote({
      title: "Panorama rapido",
      content: "# Vista\n- modulo A\n- modulo B\n\n# Estado\n- listo\n- abierto",
      relatedTo: [rel("a", "related-to"), rel("b", "related-to")],
    });

    const result = getEffectiveMetadata(note, {
      inboundReferences: 5,
      linkedByPermanentNotes: 3,
      anchorCandidate: true,
    });

    expect(result.role).toBe("summary");
    expect(result.roleSource).toBe("suggested");
    expect(result.importance).toBe("high");
    expect(result.importanceSource).toBe("suggested");
    expect(result.alwaysLoadSource).toBe("none");
  });

  it("reports none provenance when no inference fires", () => {
    const note = makeNote({
      title: "Apunte",
      content: "Texto libre sin forma marcada. Solo una observacion corta sobre algo que cambio ayer.",
      lifecycle: "temporary",
    });

    const result = getEffectiveMetadata(note);

    expect(result.role).toBeUndefined();
    expect(result.roleSource).toBe("none");
    expect(result.importance).toBeUndefined();
    expect(result.importanceSource).toBe("none");
    expect(result.alwaysLoad).toBeUndefined();
    expect(result.alwaysLoadSource).toBe("none");
  });

  it("suggests summary from structure and graph shape without English keywords", () => {
    const note = makeNote({
      title: "Panorama rapido",
      content: "# Vista\n- modulo A\n- modulo B\n\n# Riesgos\n- cola lenta\n- cache fria\n\n# Estado\n- listo\n- abierto",
    });

    expect(suggestRole(note, { inboundReferences: 5, linkedByPermanentNotes: 3 })).toBe("summary");
  });

  it("suggests decision from dependency shape and explanatory structure without English decision keywords", () => {
    const note = makeNote({
      title: "Cambio de flujo",
      content: "## Situacion\nModulo A depende de B.\n\n## Restricciones\n- latencia\n- retries\n\n## Consecuencias\nSe simplifica el camino de lectura.",
      relatedTo: [rel("base", "explains"), rel("legacy", "supersedes")],
    });

    expect(suggestRole(note, { inboundReferences: 2, linkedByPermanentNotes: 1 })).toBe("decision");
  });

  it("suggests plan from ordered task structure without English plan keywords", () => {
    const note = makeNote({
      title: "Semana 14",
      content: "1. Preparar datos\n2. Mover trafico\n3. Verificar rutas\n\n- [ ] cerrar huecos\n- [ ] medir tiempos",
    });

    expect(suggestRole(note)).toBe("plan");
  });

  it("suggests reference from lookup-oriented structure in non-engineering content", () => {
    const note = makeNote({
      title: "Guia del mercado",
      content: "Tomates: puesto 4\nPan: puesto 7\nMiel: puesto 11\nQueso: puesto 14\n\n| sala | horario |\n| --- | --- |\n| patio | 08-12 |\n| norte | 09-18 |",
    });

    expect(suggestRole(note)).toBe("reference");
  });

  it("suggests context as a weak fallback when appropriate", () => {
    const note = makeNote({
      title: "Barrio central",
      content: "# Entorno\nLa plaza conecta el mercado y la estacion.\n\n# Limites\nEl ruido sube por la tarde y baja al amanecer.",
      relatedTo: [rel("mapa", "related-to")],
    });

    expect(suggestRole(note, { inboundReferences: 1 })).toBe("context");
  });

  it("returns no role suggestion for an ambiguous note", () => {
    const note = makeNote({
      title: "Apunte",
      content: "Texto libre sin forma marcada. Solo una observacion corta sobre algo que cambio ayer.",
      lifecycle: "temporary",
    });

    expect(suggestRole(note)).toBeUndefined();
  });

  it("infers high importance for strong durable hubs", () => {
    const note = makeNote({
      title: "Panorama rapido",
      content: "# Vista\n- modulo A\n- modulo B\n\n# Estado\n- listo\n- abierto",
      relatedTo: [rel("a", "related-to"), rel("b", "related-to"), rel("c", "related-to")],
    });

    expect(suggestImportance(note, { inboundReferences: 6, linkedByPermanentNotes: 4, anchorCandidate: true })).toBe("high");
  });

  it("never infers low importance", () => {
    const note = makeNote({
      title: "Apunte tenue",
      content: "nota corta",
      lifecycle: "temporary",
    });

    const importance = suggestImportance(note);
    expect(importance).not.toBe("low");
    expect(importance).toBeUndefined();
  });

  it("does not infer normal importance for a structured permanent note without graph signals", () => {
    const note = makeNote({
      title: "Panorama rapido",
      content: "# Vista\n- modulo A\n- modulo B\n\n# Estado\n- listo\n- abierto",
      lifecycle: "permanent",
      relatedTo: [],
    });

    expect(suggestImportance(note)).toBeUndefined();
  });

  it("handles mixed-language samples from structure and graph evidence", () => {
    const note = makeNote({
      title: "Mapa del quartier",
      content: "# Zona\n- calle A\n- calle B\n\n# Etat\n- stable\n- ouvert\n\n# Rutas\n- bus\n- metro",
    });

    expect(suggestRole(note, { inboundReferences: 4, linkedByPermanentNotes: 2 })).toBe("summary");
    expect(suggestImportance(note, { inboundReferences: 2 })).toBe("normal");
  });

  it("cue-word variants do not change the role when structure is identical", () => {
    const base = makeNote({
      title: "nota breve",
      content: "Texto libre sin forma marcada. Solo una observacion corta sobre algo que cambio ayer.",
      lifecycle: "temporary",
    });
    const cueVariant = makeNote({
      title: "summary decision plan reference context",
      content: base.content,
      lifecycle: "temporary",
    });

    expect(suggestRole(base)).toBeUndefined();
    expect(suggestRole(cueVariant)).toBeUndefined();
  });

  it("unsupported-language notes behave the same as cue-word variants when structure is identical", () => {
    const cueVariant = makeNote({
      title: "summary decision plan reference context",
      content: "Texto libre sin forma marcada. Solo una observacion corta sobre algo que cambio ayer.",
      lifecycle: "temporary",
    });
    const unsupportedLanguage = makeNote({
      title: "kontekst plano resumo viite paatos",
      content: cueVariant.content,
      lifecycle: "temporary",
    });

    expect(suggestRole(cueVariant)).toBeUndefined();
    expect(suggestRole(unsupportedLanguage)).toBeUndefined();
  });

  it("does not let wording cues alone cross the threshold", () => {
    const note = makeNote({
      title: "summary decision plan reference context",
      content: "summary decision plan reference context\nsummary decision plan reference context",
      lifecycle: "temporary",
    });

    expect(suggestRole(note)).toBeUndefined();
  });
});
