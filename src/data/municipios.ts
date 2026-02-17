import csvData from './municipios_mesorregioes.csv?raw';

export type Municipio = {
  ibge: string;
  uf: string;
  name: string;
  mesoCode: string;
  mesoName: string;
};

let _cache: Municipio[] | null = null;

export function getAllMunicipios(): Municipio[] {
  if (_cache) return _cache;
  _cache = csvData
    .split('\n')
    .slice(1)
    .filter(l => l.trim())
    .map(line => {
      const [ibge, uf, name, mesoCode, mesoName] = line.split(';').map(s => s.trim());
      return { ibge, uf, name, mesoCode, mesoName };
    });
  return _cache;
}

export function getUFs(): string[] {
  const ufs = new Set(getAllMunicipios().map(m => m.uf));
  return [...ufs].sort();
}

export function getMesosByUF(uf: string): { code: string; name: string }[] {
  const mesos = new Map<string, string>();
  getAllMunicipios()
    .filter(m => m.uf === uf)
    .forEach(m => mesos.set(m.mesoCode, m.mesoName));
  return [...mesos.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getMunicipiosByMeso(mesoCode: string): Municipio[] {
  return getAllMunicipios()
    .filter(m => m.mesoCode === mesoCode)
    .sort((a, b) => a.name.localeCompare(b.name));
}
