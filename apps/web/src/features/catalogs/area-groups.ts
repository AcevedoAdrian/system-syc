interface AreaLike {
  tipo?: { id: string } | null;
}

interface TipoLike {
  id: string;
}

export interface AreaGroup<TTipo extends TipoLike, TArea extends AreaLike> {
  tipo: TTipo;
  areas: TArea[];
}

// SPEC 08 y 09 (9.7): las áreas se agrupan bajo un título por tipo. Los grupos siguen el orden del
// catálogo Tipos de área, las áreas de cada grupo el que traen, y un grupo sin áreas no se devuelve.
// `rest` son las áreas cuyo tipo no está en `tipos` (por ejemplo, mientras ese catálogo carga): quien
// dibuja las muestra al final, sin grupo, para que ninguna quede afuera.
export function groupAreasByTipo<TTipo extends TipoLike, TArea extends AreaLike>(
  areas: TArea[],
  tipos: TTipo[],
): { groups: AreaGroup<TTipo, TArea>[]; rest: TArea[] } {
  const known = new Set(tipos.map((tipo) => tipo.id));
  return {
    groups: tipos
      .map((tipo) => ({ tipo, areas: areas.filter((area) => area.tipo?.id === tipo.id) }))
      .filter((group) => group.areas.length > 0),
    rest: areas.filter((area) => !area.tipo || !known.has(area.tipo.id)),
  };
}
