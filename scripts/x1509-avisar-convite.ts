// x1509 invite notice - tells converted accounts that sign-in moved to Microsoft.
// This script exists because converting an account notifies nobody. A person
// trying the old password would only see invalid credentials and open a
// ticket. This script sends the invite kind of the MSGFLOW notice (no
// password, with the access button) to every already converted account.
//
//   deno run -A --env-file=.env scripts/x1509-avisar-convite.ts
//   deno run -A --env-file=.env scripts/x1509-avisar-convite.ts --limit 2 --apply
//   deno run -A --env-file=.env scripts/x1509-avisar-convite.ts --apply
//
// Without --apply it calls the MSGFLOW test endpoint, which validates and
// sends nothing. --limit N sends only to the first N rows: run a pilot
// before the batch. --so <email> targets one address.
//
// Idempotency: MSGFLOW dedupes by account, kind and timestamp. This script
// uses one timestamp for the whole run, so repeating the same command in the
// same minute does not notify the same person twice; a new run (new mark)
// resends on purpose, because resending an invite is a feature - the first
// mail gets lost.
import { sendAccountNotice } from "../lib/server/alerts/account-notice.ts";

import { maskEmail, safeReason } from "./import-users.ts";

import { getCompanyName } from "../lib/company.ts";

import { queryRows } from "../lib/server/db.ts";

interface Alvo {
  id: number;
  email: string;
  name: string;
  phone: string;
}

function flag(nome: string): string | undefined {
  const i = Deno.args.indexOf(nome);
  if (i < 0 || i + 1 >= Deno.args.length) return undefined;
  return Deno.args[i + 1];
}

// Output masking comes from the shared import helper; the --so
// input and the notice login stay exact.

// THE TEXT THE PERSON READS. It stays at the top because it is the only part
// of this routine anyone will want to re-read before 123 people receive it.
//
// The mail subject is fixed in the template; what enters {{message}} is
// below. The title only reaches whatsapp, whose template renders {{title}}.
const empresa = getCompanyName();
const contaParte = empresa !== ""
  ? `sua conta Microsoft da ${empresa}`
  : "sua conta corporativa Microsoft";
const MENSAGEM = [
  "A partir de agora voce entra no monitor de barreiras com " + contaParte +
  " - a mesma do seu e-mail. Nao ha senha para criar",
  'nem para lembrar: clique no botao abaixo e escolha "Entrar com',
  'Microsoft". Se voce ja usava uma senha neste sistema, ela nao vale mais.',
].join(" ");

const TITULO = "Acesso ao monitor de barreiras pela conta Microsoft";

const aplicar = Deno.args.includes("--apply");
const limite = Number(flag("--limit") ?? "0") || 0;
const so = (flag("--so") ?? "").trim().toLowerCase();

// The batch only reaches non-admin accounts: a mass notice must not surprise
// whoever administers the system. But --so names an address, and whoever
// names it knows who is being called - including the admin sending the pilot
// to themselves. So the role filter is dropped when --so is present.
const alvos = so !== ""
  ? await queryRows<Alvo>(
    `select id, email, coalesce(nullif(name, ''), email) as name,
            coalesce(phone, '') as phone
       from users
       where auth_source = 'entra' and active and lower(email) = $1`,
    [so],
  )
  : await queryRows<Alvo>(
    `select id, email, coalesce(nullif(name, ''), email) as name,
            coalesce(phone, '') as phone
       from users
       where auth_source = 'entra' and role = 'user' and active
       order by email`,
  );
const lote = limite > 0 ? alvos.slice(0, limite) : alvos;

console.log("contas Entra a avisar: " + lote.length);
console.log(
  aplicar
    ? "modo: ENVIANDO DE VERDADE"
    : "modo: ENSAIO (/conta/teste, nada sai)",
);
console.log("");

// One mark for the whole run - see the idempotency note above.
const marca = new Date().toISOString();

let ok = 0;
const falhas: Array<{ id: number; email: string; porque: string }> = [];

for (const a of lote) {
  const r = await sendAccountNotice({
    accountId: a.id,
    kind: "convite",
    name: a.name,
    login: a.email,
    phone: a.phone,
    occurredAt: marca,
    message: MENSAGEM,
    title: TITULO,
    dryRun: !aplicar,
  });
  if (r.sent) {
    ok++;
    console.log("  OK     user #" + a.id + " " + maskEmail(a.email));
  } else {
    falhas.push({ id: a.id, email: a.email, porque: r.reason ?? "sem motivo" });
    console.log(
      "  FALHOU user #" + a.id + " " + maskEmail(a.email) + "  -> " +
        safeReason(r.reason, a.email),
    );
  }
  // Breather between sends: the MSGFLOW queue is shared with barrier alerts,
  // and 123 POSTs in a burst would compete with them.
  await new Promise((res) => setTimeout(res, 250));
}

console.log("");
console.log(
  (aplicar ? "enviados: " : "validados: ") + ok + " de " + lote.length,
);
if (falhas.length > 0) {
  console.log("falhas: " + falhas.length);
  for (const f of falhas) {
    console.log(
      "   user #" + f.id + " " + maskEmail(f.email) + "  -> " +
        safeReason(f.porque, f.email, 300),
    );
  }
}
Deno.exit(falhas.length > 0 ? 1 : 0);
