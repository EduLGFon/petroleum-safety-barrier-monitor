-- ═══════════════════════════════════════════════════════════════════════════
-- SEED - static lookup tables, mirroring lib/enums.ts id-for-id
-- ═══════════════════════════════════════════════════════════════════════════
-- Idempotent: safe to re-run. Do not change existing ids once barriers
-- reference them - add new rows with new ids instead. Only STATIC tables
-- live here (statuses, ranks, groupings, typologies, owners, loc_descs,
-- authors); locations/categories are dynamic (see below).
--
-- locations and categories are DYNAMIC: they mirror the live Fracttal
-- taxonomy and start EMPTY. The live sync creates rows as new labels
-- arrive (ids continue past max(id)); scripts/fracttal-import.ts --apply
-- rebuilds them deterministically from a dump (ids sorted); 0 = 'ALL'
-- stays a UI-only sentinel that is never a row. scripts/seed.ts inserts
-- the mock rows its demo data needs by itself. Never hand-seed labels
-- here: a fixed snapshot goes stale and the sync used to skip every asset
-- outside it.

-- locations rows are created by the live sync / dump import, never seeded
-- (see header). The legacy id-0 sentinel cleanup stays: no barrier may
-- ever point at it.
delete from locations where id = 0 and not exists (
  select 1 from barriers where location_id = 0
);

insert into availability_statuses (id, label, is_compliant) values
  (0, 'Disponível', true),
  (1, 'Fora de Operação', true),
  (2, 'Indisponível Contingenciado', true),
  (3, 'Degradado Contingenciado', true),
  (4, 'Degradado', false),
  (5, 'Indisponível', false)
on conflict (id) do update set label = excluded.label, is_compliant = excluded.is_compliant;

-- Criticality ranks ESO > A > B > C > D (verified 2026-09-27 against the
-- dump: TAG suffix letter plus the groups_2 ESO flag). Three ordered steps
-- (the FK is checked per statement, so the new rows must exist before the
-- remap references them): (1) add the collision-free rank rows; (2) one-time
-- remap of legacy binary rows - old 0 ('Não Crítica') becomes rank D (4),
-- old 1 ('Crítica') stays 1 which is now rank A, guarded by the old label
-- so re-runs never touch new ESO (0) rows; (3) relabel 0/1 to the ranks.
-- The next poller cycle rewrites every in-scope row's rank anyway
-- (criticality_id rides the sync signature).
insert into criticality_levels (id, label) values
  (2, 'B'),
  (3, 'C'),
  (4, 'D')
on conflict (id) do update set label = excluded.label;
update barriers set criticality_id = 4 where criticality_id = 0
  and exists (
    select 1 from criticality_levels where id = 0 and label = 'Não Crítica'
  );
insert into criticality_levels (id, label) values
  (0, 'ESO'),
  (1, 'A')
on conflict (id) do update set label = excluded.label;

-- categories rows are created by the live sync / dump import, never
-- seeded (see header). scripts/seed.ts inserts the mock rows its
-- demo data needs by itself.


insert into groupings (id, label) values
  (0, 'Sistemas de Alívio'),
  (1, 'Evacuação, Resgate e Abandono'),
  (2, 'Intertravamento de Segurança'),
  (3, 'Resposta à Emergência da Brigada'),
  (4, 'Resposta à Emergência da Operação'),
  (5, 'Sistemas de Proteção Pós Liberação'),
  (6, 'Controle de Fonte de Ignição'),
  (7, 'Alarmes Críticos e Intervenção Humana')
on conflict (id) do update set label = excluded.label;

insert into typologies (id, label) values
  (0, 'Estação Coletora'),
  (1, 'Campo'),
  (2, 'Duto de Transferência'),
  (3, 'Poço (RTSGI)'),
  (4, 'Estação de Vapor'),
  (5, 'Subestação')
on conflict (id) do update set label = excluded.label;

insert into owners (id, label) values
  (0, 'Operação'),
  (1, 'SMS'),
  (2, 'Manutenção')
on conflict (id) do update set label = excluded.label;

insert into loc_descs (id, label) values
  (0, 'Próx. ao Separador de Teste'),
  (1, 'Próx. ao Manifold de Produção'),
  (2, 'Área do Compressor Principal'),
  (3, 'Sala Elétrica Principal'),
  (4, 'Área de Descarregamento/Carreg.'),
  (5, 'Próximo às Caldeiras'),
  (6, 'Caixa de API'),
  (7, 'Plataforma de Acesso Norte'),
  (8, 'Área do Tanque de Armazenamento'),
  (9, 'Subestação Elétrica SE-01'),
  (10, 'Área de Bombeamento'),
  (11, 'Torre de Destilação T-100'),
  (12, 'Unidade de Processamento UP-02'),
  (13, 'Módulo de Controle MCE'),
  (14, 'Linha de Transferência LT-300'),
  (15, 'Ponto de Coleta PC-14'),
  (16, 'Disjuntor Interligação Gerador'),
  (17, 'Válvula de Bloqueio Principal'),
  (18, 'Área de Compressão AC-05'),
  (19, 'Área de Filtração')
on conflict (id) do update set label = excluded.label;

insert into authors (id, name) values
  (0, 'João Silva'),
  (1, 'Maria Santos'),
  (2, 'Carlos Oliveira'),
  (3, 'Ana Costa'),
  (4, 'Pedro Alves'),
  (5, 'Fernanda Lima'),
  (6, 'Ricardo Souza'),
  (7, 'Camila Ferreira'),
  (8, 'Marcelo Gomes'),
  (9, 'Patrícia Nunes'),
  (10, 'Sincronização Fracttal')
on conflict (id) do update set name = excluded.name;