import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

const prisma = new PrismaClient();

async function importLaws() {
  try {
    console.log('法令データのインポートを開始します...\n');

    // 既存データをクリア
    console.log('既存データをクリアしています...');
    await prisma.item.deleteMany({});
    await prisma.paragraph.deleteMany({});
    await prisma.article.deleteMany({});
    await prisma.law.deleteMany({});
    console.log('データベースをクリアしました\n');

    // XMLファイルを読み込み
    const lawsDataPath = path.join(__dirname, '../laws_data/sample');
    const files = await fs.readdir(lawsDataPath);
    const xmlFiles = files.filter(f => f.endsWith('.xml'));

    console.log(`${xmlFiles.length}件の法令を処理します\n`);

    for (const file of xmlFiles) {
      const lawId = file.replace('.xml', '');
      const xmlPath = path.join(lawsDataPath, file);
      const xmlContent = await fs.readFile(xmlPath, 'utf-8');

      // タイトルを抽出
      const titleMatch = xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
      if (!titleMatch) {
        console.warn(`${file}: タイトルが見つかりません`);
        continue;
      }

      const title = titleMatch[1];
      
      // 法令番号を抽出
      const lawNumberMatch = xmlContent.match(/<LawNum>([^<]+)<\/LawNum>/);
      const lawNumber = lawNumberMatch ? lawNumberMatch[1] : null;

      console.log(`${title} をインポート中...`);

      // 法令を保存
      const law = await prisma.law.create({
        data: {
          id: lawId,
          title: title,
          lawNumber: lawNumber,
          xmlContent: xmlContent,
        },
      });

      // 条文を抽出
      const articleMatches = xmlContent.matchAll(/<Article[^>]*Num="(\d+)"[^>]*>([\s\S]*?)<\/Article>/g);
      const processedArticles = new Set<string>();
      
      for (const match of articleMatches) {
        const articleNumber = match[1];
        const articleContent = match[2];
        
        // 重複チェック
        if (processedArticles.has(articleNumber)) {
          console.warn(`  警告: 重複する条番号をスキップ: 第${articleNumber}条`);
          continue;
        }
        processedArticles.add(articleNumber);
        
        // 条文タイトルを抽出
        const articleTitleMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
        const articleTitle = articleTitleMatch ? articleTitleMatch[1] : null;

        // 第1項の内容を抽出
        const paragraphMatch = articleContent.match(/<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/);
        const content = paragraphMatch ? paragraphMatch[1].replace(/<[^>]*>/g, '') : '';

        // 条文を保存
        const article = await prisma.article.create({
          data: {
            lawId: lawId,
            articleNumber: articleNumber,
            articleTitle: articleTitle,
            content: content,
          },
        });

        // 項を抽出して保存
        const paragraphMatches = articleContent.matchAll(/<Paragraph[^>]*(?:Num="(\d+)")?[^>]*>([\s\S]*?)<\/Paragraph>/g);
        let paragraphNum = 0;
        
        for (const pMatch of paragraphMatches) {
          paragraphNum++;
          const paragraphNumber = pMatch[1] ? parseInt(pMatch[1]) : paragraphNum;
          const paragraphContent = pMatch[2];
          
          const sentenceMatch = paragraphContent.match(/<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/);
          const sentence = sentenceMatch ? sentenceMatch[1].replace(/<[^>]*>/g, '') : '';

          if (sentence) {
            const paragraph = await prisma.paragraph.create({
              data: {
                articleId: article.id,
                paragraphNumber: paragraphNumber,
                content: sentence,
              },
            });

            // 号を抽出して保存
            const itemMatches = paragraphContent.matchAll(/<Item[^>]*Num="(\d+)"[^>]*>([\s\S]*?)<\/Item>/g);
            
            for (const iMatch of itemMatches) {
              const itemNumber = iMatch[1];
              const itemContent = iMatch[2];
              
              const itemSentenceMatch = itemContent.match(/<ItemSentence>([\s\S]*?)<\/ItemSentence>/);
              const itemSentence = itemSentenceMatch ? itemSentenceMatch[1].replace(/<[^>]*>/g, '') : '';

              if (itemSentence) {
                await prisma.item.create({
                  data: {
                    paragraphId: paragraph.id,
                    itemNumber: itemNumber,
                    content: itemSentence,
                  },
                });
              }
            }
          }
        }
      }

      console.log(`  ✅ ${title} をインポートしました`);
    }

    console.log('\n✅ すべての法令のインポートが完了しました！');

    // 統計情報を表示
    const lawCount = await prisma.law.count();
    const articleCount = await prisma.article.count();
    const paragraphCount = await prisma.paragraph.count();
    const itemCount = await prisma.item.count();

    console.log('\n📊 統計情報:');
    console.log(`  法令数: ${lawCount}`);
    console.log(`  条文数: ${articleCount}`);
    console.log(`  項数: ${paragraphCount}`);
    console.log(`  号数: ${itemCount}`);

  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプトを実行
importLaws();