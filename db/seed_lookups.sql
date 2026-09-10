-- ═══════════════════════════════════════════════════════════════════════════
-- SEED — lookup tables, mirroring lib/enums.ts id-for-id
-- ═══════════════════════════════════════════════════════════════════════════
-- Idempotent: safe to re-run. Do not change existing ids once barriers
-- reference them — add new rows with new ids instead.

insert into locations (id, code, tipo) values
  (1, 'FAL', 'Estação Coletora'),
  (2, 'CNC', 'Concessão Norte-Centro'),
  (3, 'CNS', 'Concessão Norte-Sul'),
  (4, 'FAP', 'Planta de Processamento'),
  (5, 'RJO', 'Base Operacional Rio'),
  (6, 'SPL', 'Base Operacional SP')
on conflict (id) do update set code = excluded.code, tipo = excluded.tipo;

-- 'ALL' (id 0) is a UI filter sentinel, not a real installation: remove the
-- legacy row when nothing references it so no barrier can point at it.
delete from locations where id = 0 and not exists (
  select 1 from barriers where location_id = 0
);

insert into disponibilidades (id, label, is_conforme) values
  (0, 'Disponível', true),
  (1, 'Fora de Operação', true),
  (2, 'Indisponível Contingenciado', true),
  (3, 'Degradado Contingenciado', true),
  (4, 'Degradado', false),
  (5, 'Indisponível', false)
on conflict (id) do update set label = excluded.label, is_conforme = excluded.is_conforme;

insert into criticidades (id, label) values
  (0, 'Não Crítica'),
  (1, 'Crítica')
on conflict (id) do update set label = excluded.label;

insert into categorias (id, label) values
  (0, 'Válvula de Alívio de Pressão'),
  (1, 'Alarmes de Emergência e Sirene'),
  (2, 'Sistema de Detecção de Gás'),
  (3, 'Sistema de Combate a Incêndio'),
  (4, 'Válvula de Bloqueio de Emergência'),
  (5, 'Sistema de Intertravamento (SIS)'),
  (6, 'Detector de Fumaça'),
  (7, 'Dispositivo de Corte de Energia'),
  (8, 'Sistema de Ventilação de Emergência'),
  (9, 'Detector de H₂S')
on conflict (id) do update set label = excluded.label;

insert into agrupamentos (id, label) values
  (0, 'Sistemas de Alívio'),
  (1, 'Evacuação, Resgate e Abandono'),
  (2, 'Detecção e Monitoramento'),
  (3, 'Combate a Incêndio'),
  (4, 'Controle de Processo'),
  (5, 'Proteção Elétrica')
on conflict (id) do update set label = excluded.label;

insert into tipologias (id, label) values
  (0, 'Estação Coletora'),
  (1, 'Planta de Processamento'),
  (2, 'Duto de Transferência'),
  (3, 'Base Operacional'),
  (4, 'Unidade de Compressão'),
  (5, 'Unidade de Medição')
on conflict (id) do update set label = excluded.label;

insert into donos (id, label) values
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
  (9, 'Patrícia Nunes')
on conflict (id) do update set name = excluded.name;
