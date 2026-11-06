// x1509 enable Entra - converts local accounts to Microsoft sign-in in batch.
// This script exists because imported accounts were born local and all with
// the same password. Converting to Entra kills that password at once - the
// column becomes NULL, there is no password left to guess - and it creates
// no new secret in its place. Whoever signs in does so with the corporate
// account the person already has.
//
// What it does NOT do: it creates no account, sends no mail, touches no
// admin. Notifying people is the other script (x1509-avisar-convite.ts) on
// purpose: converting is reversible with one UPDATE, sending mail is not.
//
//   deno run -A --env-file=.env scripts/x1509-habilitar-entra.ts
//   deno run -A --env-file=.env scripts/x1509-habilitar-entra.ts --apply
//   deno run -A --env-file=.env scripts/x1509-habilitar-entra.ts --entra entra_users.json --apply
//
// Without --apply it only shows what it would do. With --entra <file.json>
// it checks each mail against the tenant account list and skips whoever does
// not match: a converted account has no password, so converting someone with
// no Microsoft account would lock them out.
import { maskEmail, safeReason } from "./import-users.ts";

import { updateUser } from "../lib/server/sql/users.ts";

import { queryRows } from "../lib/server/db.ts";

interface Candidato {
  id: number;
  email: string;
  name: string;
}

function flag(nome: string): string | undefined {
  const i = Deno.args.indexOf(nome);
  if (i < 0 || i + 1 >= Deno.args.length) return undefined;
  return Deno.args[i + 1];
}

// Output masking comes from the shared import helper; matching stays
// exact.

// tenantEmails: accepts both the raw Graph output (array of objects with
// userPrincipalName/mail) and a plain list of addresses, because the file can
// come from anywhere. All lowercase: the match is exact.
function tenantEmails(bruto: unknown): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.includes("@")) {
      out.add(v.trim().toLowerCase());
    }
  };
  const lista = Array.isArray(bruto)
    ? bruto
    : (bruto as { value?: unknown[] })?.value ?? [];
  for (const item of lista as unknown[]) {
    if (typeof item === "string") {
      add(item);
      continue;
    }
    const o = item as Record<string, unknown>;
    add(o.userPrincipalName);
    add(o.mail);
  }
  return out;
}

const aplicar = Deno.args.includes("--apply");
const arquivoEntra = flag("--entra");

let noTenant: Set<string> | null = null;
if (arquivoEntra) {
  noTenant = tenantEmails(JSON.parse(await Deno.readTextFile(arquivoEntra)));
  console.log(
    "contas no tenant lidas de " + arquivoEntra + ": " + noTenant.size,
  );
}

const candidatos = await queryRows<Candidato>(
  `select id, email, coalesce(nullif(name, ''), email) as name
     from users
     where auth_source = 'local' and role = 'user' and active
     order by email`,
);
console.log("contas locais nao-admin: " + candidatos.length);
console.log(aplicar ? "modo: APLICANDO" : "modo: ENSAIO (nada e gravado)");
console.log("");

let convertidos = 0;
const pulados: Array<{ id: number; email: string; porque: string }> = [];

for (const c of candidatos) {
  const email = c.email.toLowerCase();
  if (noTenant && !noTenant.has(email)) {
    pulados.push({
      id: c.id,
      email: c.email,
      porque: "sem conta no tenant com este e-mail",
    });
    console.log(
      "  PULA     user #" + c.id + " " + maskEmail(c.email) +
        "  (nao achei no tenant)",
    );
    continue;
  }
  if (!aplicar) {
    convertidos++;
    console.log("  (ensaio) user #" + c.id + " " + maskEmail(c.email));
    continue;
  }
  try {
    // The same path as the "Convert to Entra" button in the UI: it clears
    // the password, revokes sessions and leaves the account pending first
    // sign-in.
    //
    // mustChangePassword returns to false in the same UPDATE: the account
    // has no password anymore, and the flag would send the person to
    // /trocar-senha, where there is nothing to change. That would be a loop
    // with no exit.
    const r = await updateUser(c.id, {
      authSource: "entra",
      mustChangePassword: false,
    });
    if (!r) throw new Error("conta sumiu durante a conversao");
    convertidos++;
    console.log("  OK       user #" + c.id + " " + maskEmail(c.email));
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    pulados.push({ id: c.id, email: c.email, porque: motivo });
    console.log(
      "  FALHOU   user #" + c.id + " " + maskEmail(c.email) + "  -> " +
        safeReason(motivo, c.email),
    );
  }
}

console.log("");
console.log("convertidos: " + convertidos + " de " + candidatos.length);
if (pulados.length > 0) {
  console.log("pulados: " + pulados.length);
  for (const p of pulados) {
    console.log(
      "   user #" + p.id + " " + maskEmail(p.email) + "  -> " +
        safeReason(p.porque, p.email, 300),
    );
  }
}

const depois = await queryRows<{ auth_source: string; n: string }>(
  `select auth_source, count(1)::text as n from users group by auth_source order by 1`,
);
console.log("");
console.log("estado agora:");
for (const d of depois) console.log("   " + d.auth_source + " = " + d.n);
Deno.exit(pulados.length > 0 ? 1 : 0);
