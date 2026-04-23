import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type AiQuotaReservation = {
  date: string;
  neurons: number;
};

type AiQuotaState = {
  date: string;
  usedNeurons: number;
};

function getUtcDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function normalizeState(value: Partial<AiQuotaState> | null): AiQuotaState {
  const today = getUtcDateKey();
  if (value?.date !== today) {
    return {
      date: today,
      usedNeurons: 0,
    };
  }

  return {
    date: today,
    usedNeurons: Number.isFinite(value.usedNeurons)
      ? Math.max(0, Math.floor(value.usedNeurons ?? 0))
      : 0,
  };
}

export class CloudflareAiQuota {
  constructor(private readonly storagePath: string) {
    mkdirSync(dirname(this.storagePath), { recursive: true });
  }

  reserve(neurons: number, dailyBudget: number) {
    const reservedNeurons = Math.max(1, Math.ceil(neurons));
    const budget = Math.max(0, Math.floor(dailyBudget));
    const state = this.readState();

    if (budget <= 0 || state.usedNeurons + reservedNeurons > budget) {
      return {
        ok: false as const,
        remainingNeurons: Math.max(0, budget - state.usedNeurons),
      };
    }

    const nextState = {
      ...state,
      usedNeurons: state.usedNeurons + reservedNeurons,
    };
    this.writeState(nextState);

    return {
      ok: true as const,
      reservation: {
        date: nextState.date,
        neurons: reservedNeurons,
      },
      remainingNeurons: Math.max(0, budget - nextState.usedNeurons),
    };
  }

  release(reservation: AiQuotaReservation) {
    const state = this.readState();
    if (state.date !== reservation.date) {
      return;
    }

    this.writeState({
      ...state,
      usedNeurons: Math.max(0, state.usedNeurons - reservation.neurons),
    });
  }

  markExhausted(dailyBudget: number) {
    const state = this.readState();
    this.writeState({
      ...state,
      usedNeurons: Math.max(state.usedNeurons, Math.max(0, Math.floor(dailyBudget))),
    });
  }

  getStatus(dailyBudget: number) {
    const budget = Math.max(0, Math.floor(dailyBudget));
    const state = this.readState();

    return {
      date: state.date,
      usedNeurons: Math.min(state.usedNeurons, budget),
      dailyNeuronBudget: budget,
      remainingNeurons: Math.max(0, budget - state.usedNeurons),
    };
  }

  private readState(): AiQuotaState {
    try {
      return normalizeState(JSON.parse(readFileSync(this.storagePath, 'utf8')) as Partial<AiQuotaState>);
    } catch {
      const state = normalizeState(null);
      this.writeState(state);
      return state;
    }
  }

  private writeState(state: AiQuotaState) {
    writeFileSync(this.storagePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
