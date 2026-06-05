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
    } else if (file.endsWith('page.tsx')) { 
      results.push(file);
    }
  });
  return results;
}

const files = walk('d:/erp-prototype/app/(erp)');
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let changed = false;
  
  const old1 = 'className="p-6 space-y-5 px-10 w-full mx-auto"';
  const new1 = 'className="p-4 sm:p-6 space-y-5 lg:px-10 w-full mx-auto"';
  if (content.includes(old1)) { content = content.replace(old1, new1); changed = true; }
  
  const old2 = 'className="p-6 space-y-6 px-10 w-full mx-auto"';
  const new2 = 'className="p-4 sm:p-6 space-y-6 lg:px-10 w-full mx-auto"';
  if (content.includes(old2)) { content = content.replace(old2, new2); changed = true; }
  
  const old3 = 'className="p-6 space-y-5 px-10  w-full mx-auto"';
  const new3 = 'className="p-4 sm:p-6 space-y-5 lg:px-10 w-full mx-auto"';
  if (content.includes(old3)) { content = content.replace(old3, new3); changed = true; }
  
  const old4 = 'className="flex-1 space-y-6 px-10 p-6 max-w-[1600px] mx-auto"';
  const new4 = 'className="flex-1 space-y-6 p-4 sm:p-6 lg:px-10 max-w-[1600px] mx-auto"';
  if (content.includes(old4)) { content = content.replace(old4, new4); changed = true; }

  if (changed) {
    fs.writeFileSync(f, content);
    console.log('Fixed:', f);
  }
});
console.log('Done!');
