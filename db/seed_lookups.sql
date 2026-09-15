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

insert into locations (id, code, type) values
  (1, 'BIG', 'Instalação'),
  (2, 'CAB', 'Instalação'),
  (3, 'CCN', 'Instalação'),
  (4, 'CCNS', 'Instalação'),
  (5, 'CD', 'Instalação'),
  (6, 'CG', 'Instalação'),
  (7, 'CJ DUTOS TERRESTRES - ÁREA CENTRO', 'Duto de Transferência'),
  (8, 'CJ DUTOS TERRESTRES - ÁREA NORTE', 'Duto de Transferência'),
  (9, 'CJ DUTOS TERRESTRES - ÁREA SUL', 'Duto de Transferência'),
  (10, 'CJ UNIDADE DE TESTE MÓVEL', 'Unidade Móvel'),
  (11, 'CNC', 'Instalação'),
  (12, 'CP', 'Instalação'),
  (13, 'ES', 'Instalação'),
  (14, 'FAL', 'Instalação'),
  (15, 'FC', 'Instalação'),
  (16, 'FCN', 'Instalação'),
  (17, 'FQ', 'Instalação'),
  (18, 'FSJ', 'Instalação'),
  (19, 'FSL', 'Instalação'),
  (20, 'FSR', 'Instalação'),
  (21, 'GU', 'Instalação'),
  (22, 'IBU', 'Instalação'),
  (23, 'JCT', 'Instalação'),
  (24, 'LB', 'Instalação'),
  (25, 'LS', 'Instalação'),
  (26, 'MA', 'Instalação'),
  (27, 'RI', 'Instalação'),
  (28, 'RP', 'Instalação'),
  (29, 'RPO', 'Instalação'),
  (30, 'RPS', 'Instalação'),
  (31, 'RSM', 'Instalação'),
  (32, 'SEI', 'Instalação'),
  (33, 'SM', 'Instalação'),
  (34, 'SML', 'Instalação'),
  (35, 'TAB', 'Instalação'),
  (36, 'UGV''S MÓVEIS - UGVM''S', 'Instalação')
on conflict (id) do update set code = excluded.code, type = excluded.type;

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
  (66, 'Válvúla')
on conflict (id) do update set label = excluded.label;

insert into groupings (id, label) values
  (0, 'Sistemas de Alívio'),
  (1, 'Evacuação, Resgate e Abandono'),
  (2, 'Detecção e Monitoramento'),
  (3, 'Combate a Incêndio'),
  (4, 'Controle de Processo'),
  (5, 'Proteção Elétrica')
on conflict (id) do update set label = excluded.label;

insert into typologies (id, label) values
  (0, 'Estação Coletora'),
  (1, 'Planta de Processamento'),
  (2, 'Duto de Transferência'),
  (3, 'Base Operacional'),
  (4, 'Unidade de Compressão'),
  (5, 'Unidade de Medição')
on conflict (id) do update set label = excluded.label;

insert into owners (id, label) values
  (0, 'Equipe de Manutenção'),
  (1, 'Operação FAL'),
  (2, 'Engenharia de Processo'),
  (3, 'Segurança Industrial'),
  (4, 'Instrumentação'),
  (5, 'Utilidades')
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