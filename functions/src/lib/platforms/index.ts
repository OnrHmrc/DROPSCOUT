import type { PlatformAdapter, PlatformId } from './types';
import { trendyolAdapter } from './trendyol';
import { hepsiburadaAdapter } from './hepsiburada';
import { n11Adapter } from './n11';

export * from './types';
export { trendyolAdapter, hepsiburadaAdapter, n11Adapter };

const REGISTRY: Record<PlatformId, PlatformAdapter<any>> = {
  trendyol: trendyolAdapter,
  hepsiburada: hepsiburadaAdapter,
  n11: n11Adapter
};

export function isPlatformId(value: unknown): value is PlatformId {
  return value === 'trendyol' || value === 'hepsiburada' || value === 'n11';
}

export function getAdapter(platform: PlatformId): PlatformAdapter<any> {
  return REGISTRY[platform];
}
