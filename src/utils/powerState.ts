import type { Equipment, Transaction } from '../types';

export interface GeneratorPowerState {
  isOn: boolean;
  latestPowerTx: Transaction | null;
  poweredUpTimestamp?: string;
  poweredDownTimestamp?: string;
}

/**
 * Determines the power state (ON or OFF) of any generator strictly from its
 * transaction history.
 *
 * Domain Rules:
 * 1. The powered on or off state of any generator is determined by the MOST RECENT
 *    power on ('PoweredUp') or power off ('PoweredDown') transaction recorded for that equipment ID.
 * 2. By default, all generators are explicitly OFF until an ON transaction is received.
 * 3. If an OFF transaction is subsequently deleted, the generator's state reverts to the
 *    most recent remaining power transaction (which may be ON).
 * 4. If all power transactions for an equipment ID are deleted, it defaults to OFF.
 */
export function getGeneratorPowerState(
  equipmentId: string,
  transactions: Transaction[]
): GeneratorPowerState {
  // 1. Filter all non-deleted power transactions for this equipment ID
  const powerTxs = transactions.filter(
    (tx) =>
      tx.equipmentId === equipmentId &&
      (tx.transactionType === 'PoweredUp' || tx.transactionType === 'PoweredDown')
  );

  // 2. By default, all generators are explicitly OFF until an ON transaction is received
  if (powerTxs.length === 0) {
    return {
      isOn: false,
      latestPowerTx: null,
      poweredUpTimestamp: undefined,
      poweredDownTimestamp: undefined,
    };
  }

  // 3. Sort descending by transactionTimestamp (newest first). Tie-break by createdAt or id
  powerTxs.sort((a, b) => {
    const timeA = new Date(a.transactionTimestamp).getTime();
    const timeB = new Date(b.transactionTimestamp).getTime();
    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
      return timeB - timeA;
    }
    const cmp = (b.transactionTimestamp || '').localeCompare(a.transactionTimestamp || '');
    if (cmp !== 0) return cmp;
    return (b.createdAt || b.id || '').localeCompare(a.createdAt || a.id || '');
  });

  const latest = powerTxs[0];
  const isOn = latest.transactionType === 'PoweredUp';

  return {
    isOn,
    latestPowerTx: latest,
    poweredUpTimestamp: isOn ? latest.transactionTimestamp : undefined,
    poweredDownTimestamp: !isOn ? latest.transactionTimestamp : undefined,
  };
}

/**
 * Reconciles the power state timestamps (poweredUpTimestamp / poweredDownTimestamp)
 * of all equipment records against the provided transaction history.
 */
export function reconcileEquipmentPowerStates(
  equipments: Equipment[],
  transactions: Transaction[]
): Equipment[] {
  return equipments.map((eq) => {
    if (eq.type !== 'GENERATOR') return eq;

    const state = getGeneratorPowerState(eq.equipmentId, transactions);
    return {
      ...eq,
      poweredUpTimestamp: state.poweredUpTimestamp,
      poweredDownTimestamp: state.poweredDownTimestamp,
    };
  });
}
