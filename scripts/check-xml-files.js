const fs = require('fs');
const path = require('path');

const XML_DATA_PATH = path.join(__dirname, '../laws_data/sample');

async function checkFiles() {
  const files = await fs.promises.readdir(XML_DATA_PATH);
  const xmlFiles = files.filter(f => f.endsWith('.xml'));
  
  console.log('Found XML files:');
  xmlFiles.forEach(file => {
    const stats = fs.statSync(path.join(XML_DATA_PATH, file));
    console.log(`- ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
  });
  
  console.log('\n132AC0000000048.xml found:', xmlFiles.includes('132AC0000000048.xml'));
}

checkFiles().catch(console.error);