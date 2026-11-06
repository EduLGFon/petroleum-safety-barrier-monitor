// x.1.5.1509 - habilita a entrada pela Microsoft, em lote.
//
// Por que existe: as contas importadas nasceram locais e todas com a MESMA
// senha. Converter para Entra mata essa senha de uma vez - a coluna vira
// NULL, nao existe mais senha a adivinhar - e nao cria segredo novo nenhum
// no lugar. Quem entra, entra pela conta corporativa que a pessoa ja tem.
//
// O que ele NAO faz: nao cria conta, nao manda e-mail, nao toca em admin.
// Avisar as pessoas e o outro script (x1509-avisar-convite.ts), de proposito:
// converter e reversivel por UPDATE, mandar e-mail nao.
//
//   deno run -A --env-file=.env scripts/x1509-habilitar-entra.ts
//   deno run -A --env-file=.env scripts/x1509-habilitar-entra.ts --apply
//   deno run -A --env-file=.env scripts/x1509-habilitar-entra.ts --entra entra_users.json --apply
//
// Sem --apply ele so mostra o que faria. Com --entra <arquivo.json> ele
// confere cada e-mail contra a lista de contas do tenant e PULA quem nao
// casar: conta convertida fica sem senha, entao converter alguem que nao
// tem conta Microsoft e tranca-lo para fora.
import { queryRows } from "../lib/server/db.ts";

import { updateUser } from "../lib/server/sql/users.ts";

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

// emailsDoTenant: aceita tanto a saida crua do Graph (array de objetos com
// userPrincipalName/mail) quanto uma lista simples de enderecos, porque o
// arquivo pode vir de onde for. Tudo minusculo: o casamento e exato.
function emailsDoTenant(bruto: unknown): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.includes("@")) out.add(v.trim().toLowerCase());
  };
  const lista = Array.isArray(bruto)
    ? bruto
    : (bruto as { value?: unknown[] })?.value ?? [];
  for (const item of lista as unknown[]) {
    if (typeof item === "string") { add(item); continue; }
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
  noTenant = emailsDoTenant(JSON.parse(await Deno.readTextFile(arquivoEntra)));
  console.log("contas no tenant lidas de " + arquivoEntra + ": " + noTenant.size);
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
const pulados: Array<{ email: string; porque: string }> = [];

for (const c of candidatos) {
  const email = c.email.toLowerCase();
  if (noTenant && !noTenant.has(email)) {
    pulados.push({ email: c.email, porque: "sem conta no tenant com este e-mail" });
    console.log("  PULA     " + c.email + "  (nao achei no tenant)");
    continue;
  }
  if (!aplicar) {
    convertidos++;
    console.log("  (ensaio) " + c.email);
    continue;
  }
  try {
    // O mesmo caminho do botao "Converter para Entra" da tela: zera a senha,
    // revoga as sessoes e deixa a conta pendente de primeiro acesso.
    //
    // mustChangePassword volta a false no MESMO update: a conta nao tem mais
    // senha, e a marca mandaria a pessoa para /trocar-senha, onde nao ha nada
    // para trocar. Seria um laco sem saida.
    const r = await updateUser(c.id, {
      authSource: "entra",
      mustChangePassword: false,
    });
    if (!r) throw new Error("conta sumiu durante a conversao");
    convertidos++;
    console.log("  OK       " + c.email);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    pulados.push({ email: c.email, porque: motivo });
    console.log("  FALHOU   " + c.email + "  -> " + motivo);
  }
}

console.log("");
console.log("convertidos: " + convertidos + " de " + candidatos.length);
if (pulados.length > 0) {
  console.log("pulados: " + pulados.length);
  for (const p of pulados) console.log("   " + p.email + "  -> " + p.porque);
}

const depois = await queryRows<{ auth_source: string; n: string }>(
  `select auth_source, count(1)::text as n from users group by auth_source order by 1`,
);
console.log("");
console.log("estado agora:");
for (const d of depois) console.log("   " + d.auth_source + " = " + d.n);
Deno.exit(pulados.length > 0 ? 1 : 0);
