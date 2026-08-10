import { logger } from '../utils/logger';

export type ConflictStrategy = 'last-write-wins' | 'server-wins';

const CONFLICT_STRATEGIES: Record<string, ConflictStrategy> = {
  'sale:create': 'last-write-wins',
  'cash-session:open': 'server-wins',
  'cash-session:close': 'last-write-wins',
};

export interface ConflictResolution {
  strategy: ConflictStrategy;
  resolution: 'local' | 'server' | 'manual';
  detail: string;
}

export function resolveConflict(
  operationType: string,
  localPayload: Record<string, unknown>,
  serverResponse: Record<string, unknown>
): ConflictResolution {
  const strategy = CONFLICT_STRATEGIES[operationType] || 'server-wins';

  logger.info('Resolving conflict', { operationType, strategy });

  switch (strategy) {
    case 'last-write-wins':
      return {
        strategy,
        resolution: 'local',
        detail: `Local operation accepted (last-write-wins strategy for ${operationType})`,
      };

    case 'server-wins':
      return {
        strategy,
        resolution: 'server',
        detail: `Server state accepted (server-wins strategy for ${operationType})`,
      };

    default:
      return {
        strategy: 'server-wins',
        resolution: 'server',
        detail: `Default server-wins resolution for ${operationType}`,
      };
  }
}

export function getConflictStrategy(operationType: string): ConflictStrategy {
  return CONFLICT_STRATEGIES[operationType] || 'server-wins';
}
