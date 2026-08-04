-- PM field smoke seed: JO00991, CAD-0039 (capture edits), CC-0012 (blocking issue)
-- Idempotent — safe to re-run against dev commtrac.db

-- Project JO00991
INSERT OR IGNORE INTO Projects (
  Id, CustomerName, CustomerId, JobNumber, Description, StartDate, FinishDate,
  Office, Region, ProjectType, Status, ApprovalDecision, IsInstallationProject,
  InstallationMode, ProjectManager, ContractValue, ProbabilityStage, ProductIds,
  ProductFeatureValuesJson, PurchaseOrderNumber, TeamMemberIdsJson, MinimumCompletionPercent,
  TimeZoneId, WorkflowMode, IsDeleted
) VALUES (
  'proj-jo00991', 'Yancoal', 'CUST-YANCOAL', 'JO00991', 'PM smoke test project',
  '2026-01-01', '2026-12-31', 'Australia', 'NSW', 'External', 'In Progress', 'Approved',
  1, 'Single Installation', 'Jose Lopez', 500000, 'Signed',
  '["00c3d07c-a925-4551-bc9b-ea8495acf3e5"]', '{}', '', '[]', 100,
  'Australia/Sydney', 'INSTALLATION_ONLY', 0
);

-- Workflow config with 3 editable text capture fields
INSERT OR REPLACE INTO WorkflowConfigs (
  Id, ProductId, Name, DisplayName, ConfigType, WorkflowTypeId, Status, Version,
  StepsJson, MediaJson, FeatureSelectionsJson, CreatedAt, UpdatedAt
) VALUES (
  'wfconfig-smoke-1',
  '00c3d07c-a925-4551-bc9b-ea8495acf3e5',
  'Smoke Install', 'Smoke Install', 'Installation', 'wftype-installation', 'Published', 1,
  '[{"id":"step-capture-1","title":"Front Camera 1","stepFeatureId":"088aa75d-fd13-4d99-bf18-07c4c95c21c9","captureFields":[{"id":"cap-serial","key":"serialNo","label":"Serial","type":"text","featureId":"088aa75d-fd13-4d99-bf18-07c4c95c21c9"},{"id":"cap-firmware","key":"firmware","label":"Firmware","type":"text","featureId":"088aa75d-fd13-4d99-bf18-07c4c95c21c9"},{"id":"cap-ip","key":"ipAddress","label":"IP Address","type":"text","featureId":"088aa75d-fd13-4d99-bf18-07c4c95c21c9"}]}]',
  '[]', '[]', datetime('now'), datetime('now')
);

-- Assets
INSERT OR REPLACE INTO ProjectAssets (
  Id, ProjectId, ProductId, AssetTag, AssetName, SerialNumber, Status,
  FeatureValuesJson, IssuesJson, AsBuiltJson, CreatedAt, UpdatedAt, IsDeleted
) VALUES (
  'asset-cad-0039', 'proj-jo00991', '00c3d07c-a925-4551-bc9b-ea8495acf3e5',
  'CAD-0039', 'Shuttle Car', 'SN-CAD-0039', 'InProgress', '{}', '[]', '{}',
  datetime('now'), datetime('now'), 0
);

INSERT OR REPLACE INTO ProjectAssets (
  Id, ProjectId, ProductId, AssetTag, AssetName, SerialNumber, Status,
  FeatureValuesJson, IssuesJson, AsBuiltJson, CreatedAt, UpdatedAt, IsDeleted
) VALUES (
  'asset-cc-0012', 'proj-jo00991', '00c3d07c-a925-4551-bc9b-ea8495acf3e5',
  'CC-0012', 'Continuous Miner', 'SN-CC-0012', 'Issue',
  '{}',
  '[{"id":"issue-cc-0012-1","description":"Hydraulic leak blocking commissioning","issueType":"blocking","isBlocking":true,"severity":"high","reportedAt":"2026-08-01T10:00:00.000Z","resolved":false}]',
  '{}', datetime('now'), datetime('now'), 0
);

-- Workflow assignments
INSERT OR IGNORE INTO AssetWorkflowAssignments (
  Id, AssetId, WorkflowConfigId, WorkflowTypeId, Active, AssignedBy, AssignedAt
) VALUES
  ('assign-cad-0039', 'asset-cad-0039', 'wfconfig-smoke-1', 'wftype-installation', 1, 'seed', datetime('now')),
  ('assign-cc-0012', 'asset-cc-0012', 'wfconfig-smoke-1', 'wftype-installation', 1, 'seed', datetime('now'));

-- In-progress run for CAD-0039 (editable capture cells)
INSERT OR REPLACE INTO AssetWorkflowRuns (
  Id, AssetId, WorkflowConfigId, WorkflowVersion, WorkflowSnapshotJson, Status, IsLocked,
  StepResultsJson, IssuesJson, TimeTrackingJson, SignatureStatus, RunNumber,
  StartedAt, CreatedAt, UpdatedAt
) VALUES (
  'run-cad-0039-1', 'asset-cad-0039', 'wfconfig-smoke-1', 1,
  '{"stepsJson":"[{\"id\":\"step-capture-1\",\"title\":\"Front Camera 1\",\"stepFeatureId\":\"088aa75d-fd13-4d99-bf18-07c4c95c21c9\",\"captureFields\":[{\"id\":\"cap-serial\",\"key\":\"serialNo\",\"label\":\"Serial\",\"type\":\"text\",\"featureId\":\"088aa75d-fd13-4d99-bf18-07c4c95c21c9\"},{\"id\":\"cap-firmware\",\"key\":\"firmware\",\"label\":\"Firmware\",\"type\":\"text\",\"featureId\":\"088aa75d-fd13-4d99-bf18-07c4c95c21c9\"},{\"id\":\"cap-ip\",\"key\":\"ipAddress\",\"label\":\"IP Address\",\"type\":\"text\",\"featureId\":\"088aa75d-fd13-4d99-bf18-07c4c95c21c9\"}]}]}",
  'InProgress', 0,
  '[{"stepId":"step-capture-1","values":{"cap-serial":"SN-OLD-1","cap-firmware":"v1.0.0","cap-ip":"10.0.0.39"},"completedAt":"2026-08-01T00:00:00.000Z"}]',
  '[]', '[]', 'None', 1,
  datetime('now'), datetime('now'), datetime('now')
);

-- Bulk filler assets (~150) to approximate medium job load for perf timing
DELETE FROM ProjectAssets WHERE Id LIKE 'asset-filler-%';
INSERT INTO ProjectAssets (
  Id, ProjectId, ProductId, AssetTag, AssetName, Status,
  FeatureValuesJson, IssuesJson, AsBuiltJson, CreatedAt, UpdatedAt, IsDeleted
)
SELECT
  'asset-filler-' || printf('%04d', n),
  'proj-jo00991',
  '00c3d07c-a925-4551-bc9b-ea8495acf3e5',
  'FILL-' || printf('%04d', n),
  'Filler Asset ' || n,
  'NotStarted',
  '{}', '[]', '{}',
  datetime('now'), datetime('now'), 0
FROM (
  WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x < 150)
  SELECT x AS n FROM cnt
);
