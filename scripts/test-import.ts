import { LawImporter } from './import-all-laws';
import * as path from 'path';

async function testImport() {
  console.log('🧪 テストインポートを開始します（サンプルデータのみ）\n');
  
  const importer = new LawImporter({
    batchSize: 2,  // バッチサイズを小さく
    skipExisting: false,
    lawsDataPath: path.join(process.cwd(), 'laws_data/sample'),
    verbose: true
  });
  
  await importer.importAll();
}

testImport().catch(console.error);