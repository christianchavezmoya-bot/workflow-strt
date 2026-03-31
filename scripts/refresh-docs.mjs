import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const today = new Date().toISOString().slice(0, 10);

function read(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(path.join(repoRoot, filePath), content, "utf8");
}

function listFiles(dirPath, predicate) {
  const fullPath = path.join(repoRoot, dirPath);
  if (!fs.existsSync(fullPath)) return [];
  return fs.readdirSync(fullPath).filter(predicate);
}

const architecturePath = "docs/ARCHITECTURE.md";
const htmlPath = "docs/commtrac-codex-915-docs.html";
const txtPath = "docs/commtrac-codex-915-docs.txt";
const schemaPath = "docs/schema.json";
const metadataPath = "docs/about-metadata.json";

const architecture = read(architecturePath).replace(/\*\*Last updated:\s*[0-9-]+\*\*/i, `**Last updated: ${today}**`);
write(architecturePath, architecture);

const schema = JSON.parse(read(schemaPath));
const controllerCount = listFiles("server/Commtrac.Api/Controllers", (name) => name.endsWith(".cs")).length;
const routeSource = read("src/app/routes.tsx");
const routeCount = (routeSource.match(/<Route\b/g) ?? []).length;
const tables = Array.isArray(schema.tables) ? schema.tables.length : 0;
const columns = Array.isArray(schema.tables) ? schema.tables.reduce((sum, table) => sum + (Array.isArray(table.columns) ? table.columns.length : 0), 0) : 0;
const relationships = Array.isArray(schema.inferredRelationships)
  ? schema.inferredRelationships.length
  : Array.isArray(schema.foreignKeys) ? schema.foreignKeys.length : 0;

const metadata = {
  refreshedAt: today,
  generatedFrom: {
    architecture: architecturePath,
    schema: schemaPath,
    routes: "src/app/routes.tsx",
    controllers: "server/Commtrac.Api/Controllers"
  },
  stats: {
    tables,
    columns,
    relationships,
    controllerCount,
    routeCount
  }
};

write(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

for (const filePath of [htmlPath, txtPath]) {
  const content = read(filePath).replace(/Generated [0-9-]+/g, `Generated ${today}`);
  write(filePath, content);
}

console.log(`Docs refreshed for ${today}`);
