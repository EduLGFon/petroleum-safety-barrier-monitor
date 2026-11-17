# Barrier status

Status labels are the exact display strings; ids are the database and wire
contract.

| Id | Label                       | Compliant | Meaning                                              |
| -- | --------------------------- | --------- | ---------------------------------------------------- |
| 0  | Disponível                  | yes       | No open urgent signal, not out of service.           |
| 1  | Fora de Operação            | yes       | Protected asset stopped and positively isolated.     |
| 2  | Indisponível Contingenciado | yes       | Unavailable with contingency in place.               |
| 3  | Degradado Contingenciado    | yes       | Degraded with contingency in place.                  |
| 4  | Degradado                   | no        | Open planned corrective with the urgent flag.        |
| 5  | Indisponível                | no        | Open urgent corrective or asset flagged unavailable. |

Compliance is fixed by id: statuses `0` through `3` are Conforme; `4` and `5`
are Não Conforme. An unknown id fails closed to Não Conforme.

Status derivation precedence is documented in
[FRACTTAL.md](FRACTTAL.md#status-derivation). This file does not add a
transition matrix: any status may follow any other, and only an actual change
is recorded.

- `2` and `3` are contingency overlays on stored `4` and `5`. The manual
  contingency flag promotes 4 to 3 and 5 to 2 at read time. Auto-detected
  GM/CEC/contingência text in open corrective work can also derive 2 or 3
  directly, with the source kept in the contingency description.
- Same-status writes are no-ops. `record_status_change()` adds no history row
  when the new status equals the current one.
- `Fora de Operação` is compliant and alert-suppressed. It represents a planned
  stop, so it does not page or email as a violation. It still appears in
  totals and history.
- `2` and `3` remain compliant even though they derive from non-compliant
  bases, because a contingency is in place.
