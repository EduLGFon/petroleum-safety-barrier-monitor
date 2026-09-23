-- ═══════════════════════════════════════════════════════════════════════════
-- SEED - lookup tables, mirroring lib/enums.ts id-for-id
-- ═══════════════════════════════════════════════════════════════════════════
-- Idempotent: safe to re-run. Do not change existing ids once barriers
-- reference them - add new rows with new ids instead.
--
-- locations and categories are DYNAMIC: they now mirror the real Fracttal
-- catalog imported by scripts/fracttal-import.ts (ids are deterministic:
-- locations 1..N sorted by station code, categories 0..N-1 sorted by label;
-- 0 = 'ALL' stays a UI-only sentinel that is never a row). Rebuilding them
-- from the live dump supersedes any hand-edits here.

insert into locations (id, code, type, name) values
  (1, 'BIG', 'Instalação', 'Biguá'),
  (2, 'CAB', 'Instalação', 'Cacimbas'),
  (3, 'CCN', 'Instalação', 'Córrego Cedro Norte'),
  (4, 'CCNS', 'Instalação', 'Corrego Cedro Norte Sul'),
  (5, 'CD', 'Instalação', 'Córrego Dourado'),
  (6, 'CG', 'Instalação', 'Campo Grande'),
  (7, 'CJ DUTOS TERRESTRES - ÁREA CENTRO', 'Duto de Transferência', null),
  (8, 'CJ DUTOS TERRESTRES - ÁREA NORTE', 'Duto de Transferência', null),
  (9, 'CJ DUTOS TERRESTRES - ÁREA SUL', 'Duto de Transferência', null),
  (10, 'CJ UNIDADE DE TESTE MÓVEL', 'Unidade Móvel', null),
  (11, 'CNC', 'Instalação', 'Cancã'),
  (12, 'CP', 'Instalação', 'Córrego das Pedras'),
  (13, 'ES', 'Instalação', 'Base Seacrest - São Mateus'),
  (14, 'FAL', 'Instalação', 'Fazenda Alegre'),
  (15, 'FC', 'Instalação', 'Fazenda Cedro'),
  (16, 'FQ', 'Instalação', 'Fazenda Queimadas'),
  (17, 'FSJ', 'Instalação', 'Fazenda São Jorge'),
  (18, 'FSL', 'Instalação', 'Fazenda Santa Luzia'),
  (19, 'FSR', 'Instalação', 'Fazenda São Rafael'),
  (20, 'GU', 'Instalação', 'Guriri'),
  (21, 'IBU', 'Instalação', 'Inhambu'),
  (22, 'JCT', 'Instalação', 'Jacutinga'),
  (23, 'LB', 'Instalação', 'Lagoa Bonita'),
  (24, 'LS', 'Instalação', 'Lagoa Suruaca'),
  (25, 'MA', 'Instalação', 'Mariricu'),
  (26, 'RI', 'Instalação', 'Rio Itaúnas'),
  (27, 'RP', 'Instalação', 'Rio Preto'),
  (28, 'RPO', 'Instalação', 'Rio Preto Oeste'),
  (29, 'RPS', 'Instalação', 'Rio Preto Sul'),
  (30, 'RSM', 'Instalação', 'Rio São Mateus'),
  (31, 'SEI', 'Instalação', 'Seriema'),
  (32, 'SM', 'Instalação', 'São Mateus'),
  (33, 'SML', 'Instalação', 'São Mateus Leste'),
  (34, 'TAB', 'Instalação', 'Tabuiaá'),
  (35, 'UGV''S MÓVEIS - UGVM''S', 'Instalação', null),
  -- Appended after the initial sorted load (never renumber existing rows):
  -- FCN/MAN come from the inventory sheet TOTAL field list.
  (36, 'FCN', 'Instalação', 'Fazenda Cedro Norte'),
  (37, 'MAN', 'Instalação', 'Mariricu Norte')
on conflict (id) do update set
  code = excluded.code,
  type = excluded.type,
  name = excluded.name;

-- 'ALL' (id 0) is a UI filter sentinel, not a real installation: remove the
-- legacy row when nothing references it so no barrier can point at it.
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

insert into criticality_levels (id, label) values
  (0, 'Não Crítica'),
  (1, 'Crítica')
on conflict (id) do update set label = excluded.label;

insert into categories (id, label) values
  (0, 'Buzina Alarme'),
  (1, 'Compressor Gás MC-A- PSE'),
  (2, 'DHSV Válvula Segurança Poço'),
  (3, 'Detector'),
  (4, 'Detector de Gás'),
  (5, 'Detector de PIG'),
  (6, 'Equipamento - Emergência'),
  (7, 'Extintor'),
  (8, 'Extintor ABC'),
  (9, 'Extintor de incêndio'),
  (10, 'Gasoduto'),
  (11, 'Gerador Emergência'),
  (12, 'Hidrante'),
  (13, 'Linha Gás anular'),
  (14, 'Linha de Gás'),
  (15, 'Miscelânea Segurança'),
  (16, 'PSV-C-RPO1-001'),
  (17, 'Painel de Alarme'),
  (18, 'Saída de Emergência'),
  (19, 'Sirene'),
  (20, 'Tampa - Alívio de Emergência'),
  (21, 'Tampa emergência'),
  (22, 'Valvula Segurança - GU-7'),
  (23, 'Valvula de Segurança'),
  (24, 'Válv. Segurança'),
  (25, 'Válv. de Segurança'),
  (26, 'Válvula'),
  (27, 'Válvula Alívio'),
  (28, 'Válvula Bloqueio'),
  (29, 'Válvula Control Nível'),
  (30, 'Válvula Controle'),
  (31, 'Válvula Controle Nível'),
  (32, 'Válvula Controle Pressão'),
  (33, 'Válvula Controle Saída'),
  (34, 'Válvula Controle de Pressão'),
  (35, 'Válvula Corta Chamas'),
  (36, 'Válvula Corta-Chama'),
  (37, 'Válvula Corta-chamas'),
  (38, 'Válvula Emergência'),
  (39, 'Válvula Manual'),
  (40, 'Válvula Manual Bloqueio'),
  (41, 'Válvula On Off'),
  (42, 'Válvula Portadora'),
  (43, 'Válvula Pressão'),
  (44, 'Válvula Reguladora'),
  (45, 'Válvula Segurança'),
  (46, 'Válvula Shutdown'),
  (47, 'Válvula Solenóide'),
  (48, 'Válvula XV'),
  (49, 'Válvula de Bloqueio'),
  (50, 'Válvula de Controle'),
  (51, 'Válvula de Controle de Pressão'),
  (52, 'Válvula de Emergência'),
  (53, 'Válvula de Manobra'),
  (54, 'Válvula de Pressão'),
  (55, 'Válvula de Segurança'),
  (56, 'Válvula de Segurança PSV'),
  (57, 'Válvula de Vazão'),
  (58, 'Válvula de alívio'),
  (59, 'Válvula-XV'),
  (60, 'Válvulas'),
  (61, 'Válvulas Segurança'),
  (62, 'Válvulas de segurança'),
  (63, 'Válvulas segurança'),
  (64, 'Válvulas- PSV'),
  (65, 'Válvulassegurança'),
  (66, 'Válvúla'),
  (67, 'Válvula BIN')
on conflict (id) do update set label = excluded.label;

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