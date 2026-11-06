// x.1.5.1509 - avisa as pessoas que o acesso ao monitor passou a ser pela
// conta Microsoft.
//
// Por que existe: converter a conta nao avisa ninguem. Quem tentar a senha
// antiga vai receber "credenciais invalidas" e abrir chamado. Este script
// manda o convite (tipo "convite" do MSGFLOW: SEM senha, com o botao de
// acesso) para cada conta ja convertida.
//
//   deno run -A --env-file=.env scripts/x1509-avisar-convite.ts
//   deno run -A --env-file=.env scripts/x1509-avisar-convite.ts --limit 2 --apply
//   deno run -A --env-file=.env scripts/x1509-avisar-convite.ts --apply
//
// Sem --apply ele usa /conta/teste do MSGFLOW, que valida tudo e NAO envia.
// --limit N manda so para os N primeiros: faca um piloto antes do lote.
// --so <email> manda para um endereco especifico.
//
// Idempotencia: o MSGFLOW deduplica por (conta, tipo, ocorrido_em). Este
// script usa UMA marca de tempo para a rodada inteira, entao repetir o mesmo
// comando no mesmo minuto nao manda duas vezes para a mesma pessoa; uma
// rodada nova (marca nova) reenvia de proposito, porque reenviar convite e
// funcao - o primeiro e-mail se perde.
import { queryRows } from "../lib/server/db.ts";

import { sendAccountNotice } from "../lib/server/alerts/account-notice.ts";

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

// O TEXTO QUE A PESSOA LE. Fica aqui, em cima, porque e a unica parte desta
// rotina que alguem vai querer reler antes de 123 pessoas receberem.
//
// O assunto do e-mail e fixo no template ("Voce recebeu acesso ao monitor de
// barreiras"); o que entra em {{message}} e isto. O titulo so alcanca o
// whatsapp, cujo template renderiza {{title}}.
const MENSAGEM = [
  "A partir de agora voce entra no monitor de barreiras com a sua conta",
  "Microsoft da Seacrest - a mesma do seu e-mail. Nao ha senha para criar",
  "nem para lembrar: clique no botao abaixo e escolha \"Entrar com",
  "Microsoft\". Se voce ja usava uma senha neste sistema, ela nao vale mais.",
].join(" ");

const TITULO = "Acesso ao monitor de barreiras pela conta Microsoft";

const aplicar = Deno.args.includes("--apply");
const limite = Number(flag("--limit") ?? "0") || 0;
const so = (flag("--so") ?? "").trim().toLowerCase();

// O lote so alcanca quem NAO e admin: um aviso em massa nao deve surpreender
// quem administra o sistema. Mas --so nomeia um endereco, e quem nomeia sabe
// quem esta chamando - inclusive para o admin mandar o piloto para si mesmo.
// Por isso o filtro de papel sai quando --so esta presente.
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
console.log(aplicar ? "modo: ENVIANDO DE VERDADE" : "modo: ENSAIO (/conta/teste, nada sai)");
console.log("");

// Uma marca para a rodada inteira - ver a nota de idempotencia acima.
const marca = new Date().toISOString();

let ok = 0;
const falhas: Array<{ email: string; porque: string }> = [];

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
    console.log("  OK     " + a.email);
  } else {
    falhas.push({ email: a.email, porque: r.reason ?? "sem motivo" });
    console.log("  FALHOU " + a.email + "  -> " + (r.reason ?? "").slice(0, 120));
  }
  // Respiro entre envios: a fila do MSGFLOW e compartilhada com os alertas
  // de barreira, e 123 POSTs em rajada competem com eles.
  await new Promise((res) => setTimeout(res, 250));
}

console.log("");
console.log((aplicar ? "enviados: " : "validados: ") + ok + " de " + lote.length);
if (falhas.length > 0) {
  console.log("falhas: " + falhas.length);
  for (const f of falhas) console.log("   " + f.email + "  -> " + f.porque);
}
Deno.exit(falhas.length > 0 ? 1 : 0);
