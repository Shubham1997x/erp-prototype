const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}
const files = walk('app').concat(walk('lib'), walk('components'));
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (content.match(/import \{.*(newId|newSeqId|hashPassword|verifyPassword|fmtCurrency|addDays|isOverdue).*\} from [\'\"]@\/lib\/utils[\'\"]/)) {
    content = content.replace(/from [\'\"]@\/lib\/utils[\'\"]/g, 'from \"@/lib/core\"');
    fs.writeFileSync(f, content);
    console.log('Updated ' + f);
  }
});
