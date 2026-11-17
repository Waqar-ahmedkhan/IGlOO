export type PortfolioProjectId = 'pudgy-penguins' | 'overpass';

export interface ProjectLink {
  label: string;
  url: string;
}

export interface ProjectSpec {
  label: string;
  value: string;
}

export interface PortfolioProject {
  id: PortfolioProjectId;
  slug: string;
  route: string;
  code: string;
  name: string;
  tempMain: string;
  tempSub: string;
  dateLabel: string;
  category: string;
  summary: string;
  watermark: string;
  worldPos: readonly [number, number, number];
  focusScroll: number;
  revealRange: readonly [number, number];
  specs: ProjectSpec[];
  links: ProjectLink[];
}

export const PORTFOLIO_PROJECTS: readonly PortfolioProject[] = [
  {
    id: 'pudgy-penguins',
    slug: 'pudgy-penguins',
    route: '/portfolio/pudgy-penguins',
    code: 'PORTFOLIO_CO_01',
    name: 'PUDGY PENGUINS',
    tempMain: '29.23',
    tempSub: '- 01.54',
    dateLabel: 'D 01.02.2020',
    category: 'CONSUMER BRAND // CHARACTER IP',
    summary:
      'Flagship consumer entertainment brand uniting digital collectibles, physical toys across global retail, original animation, and an expansive community-owned intellectual property ecosystem.',
    watermark: 'PUDGY PENGUINS // 01',
    worldPos: [0.0, 0.02, -3.5],
    focusScroll: 0.53,
    revealRange: [0.435, 0.64],
    specs: [
      { label: 'ARCHIVE_ID', value: 'CO_01 // PENGUIN' },
      { label: 'INCEPTION', value: '01.02.2020' },
      { label: 'CORE_TEMP', value: '-01.54 C' },
      { label: 'CLASSIFICATION', value: 'CONSUMER IP' },
    ],
    links: [
      { label: 'WEBSITE', url: 'https://www.pudgypenguins.com' },
      { label: 'X / TWITTER', url: 'https://x.com/pudgypenguins' },
    ],
  },
  {
    id: 'overpass',
    slug: 'overpass',
    route: '/portfolio/overpass',
    code: 'PORTFOLIO_CO_02',
    name: 'OVERPASS',
    tempMain: '23.96',
    tempSub: '- 04.47',
    dateLabel: 'D 06.01.2023',
    category: 'LICENSING PROTOCOL // DIGITAL IP',
    summary:
      'On-chain intellectual property licensing marketplace connecting digital character holders directly with consumer brands, creators, and manufacturers for commercial rights and royalties.',
    watermark: 'OVERPASS IP // 02',
    worldPos: [0.15, -0.04, -17.5],
    focusScroll: 0.77,
    revealRange: [0.685, 0.87],
    specs: [
      { label: 'ARCHIVE_ID', value: 'CO_02 // OVERPASS' },
      { label: 'DEPLOYMENT', value: '06.01.2023' },
      { label: 'CORE_TEMP', value: '-04.47 C' },
      { label: 'CLASSIFICATION', value: 'IP PROTOCOL' },
    ],
    links: [
      { label: 'WEBSITE', url: 'https://www.overpassip.com' },
      { label: 'X / TWITTER', url: 'https://x.com/OverpassIP' },
    ],
  },
] as const;

export function getProjectById(id: PortfolioProjectId | null): PortfolioProject | null {
  if (!id) return null;
  return PORTFOLIO_PROJECTS.find((p) => p.id === id) ?? null;
}

export function getProjectByPathname(pathname: string): PortfolioProject | null {
  const normalized = pathname.replace(/\/+$/, '').toLowerCase();
  return (
    PORTFOLIO_PROJECTS.find(
      (p) => normalized === p.route || normalized === `/${p.slug}`,
    ) ?? null
  );
}
