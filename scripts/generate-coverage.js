// Regenerates a coverage summary directly from the compiled rule database,
// so documentation never drifts out of sync with the actual rules.
//
// Usage: npm run compile && node scripts/generate-coverage.js
//
// Prints a markdown table (paste into README.md) and a detailed per-category
// breakdown of every rule's "what happened" summary.

const { errorRules } = require('../dist/errorDatabase.js');

function labelFor(id) {
  const prefixMap = [
    [/^node-|^npm-|^ts-|^webpack-|^vite-|^react-|^cors-/, 'JavaScript / TypeScript / Node.js'],
    [/^python-|^pip-/, 'Python'],
    [/^git-/, 'Git'],
    [/^java-/, 'Java'],
    [/^csharp-|^dotnet-/, 'C# / .NET'],
    [/^go-/, 'Go'],
    [/^kotlin-/, 'Kotlin'],
    [/^ruby-/, 'Ruby'],
    [/^php-/, 'PHP'],
    [/^swift-/, 'Swift'],
    [/^cpp-/, 'C / C++'],
    [/^rust-/, 'Rust'],
    [/^docker-/, 'Docker'],
    [/^mongo-|^mysql-|^postgres-/, 'Databases'],
    [/^maven-|^gradle-|^cmake-/, 'Build tools'],
    [/^pytest-|^jest-|^eslint-/, 'Test frameworks & linters']
  ];

  for (const [pattern, label] of prefixMap) {
    if (pattern.test(id)) return label;
  }
  return 'General / OS / Networking';
}

const groups = {};
for (const rule of errorRules) {
  const label = labelFor(rule.id);
  if (!groups[label]) groups[label] = [];
  groups[label].push(rule.whatHappened);
}

const sortedLabels = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);

console.log(`Total: ${errorRules.length} error patterns across ${sortedLabels.length} categories\n`);
console.log('| Category | Rules |');
console.log('|---|---|');
for (const label of sortedLabels) {
  console.log(`| ${label} | ${groups[label].length} |`);
}

console.log('\n\n--- Detailed breakdown (not for README, just for your own reference) ---\n');
for (const label of sortedLabels) {
  console.log(`### ${label} (${groups[label].length})`);
  for (const wh of groups[label]) {
    console.log(`- ${wh}`);
  }
  console.log('');
}
