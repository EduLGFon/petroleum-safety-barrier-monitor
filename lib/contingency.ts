// Contingency policy helpers shared by the modal and its tests.
export interface ContingencyEligibility {
  eligible: boolean;
}

export function shouldRecommendOutOfOperation(
  compliance: string,
  contingencies: readonly ContingencyEligibility[],
): boolean {
  return compliance === "Não Conforme" &&
    !contingencies.some((contingency) => contingency.eligible);
}
