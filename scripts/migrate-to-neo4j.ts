import { PrismaClient } from '../src/generated/prisma';
import { initNeo4jDriver, closeNeo4jDriver } from '../src/lib/neo4j';
import * as dotenv from 'dotenv';

// 環境変数を読み込む
dotenv.config();

const prisma = new PrismaClient();

/**
 * SQLiteからNeo4jへのデータ移行
 */
async function migrateToNeo4j() {
  const driver = initNeo4jDriver();
  const session = driver.session();

  try {
    console.log('📦 SQLiteからNeo4jへのデータ移行を開始します...\n');

    // 既存のNeo4jデータをクリア（開発環境のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log('既存のNeo4jデータをクリアしています...');
      await session.run('MATCH (n) DETACH DELETE n');
    }

    // 1. 法令データの移行
    console.log('\n[1/5] 法令データを移行中...');
    const laws = await prisma.law.findMany();
    
    for (const law of laws) {
      await session.run(`
        CREATE (l:Law {
          id: $id,
          title: $title,
          lawNumber: $lawNumber,
          lawType: $lawType,
          effectiveDate: $effectiveDate,
          promulgationDate: $promulgationDate,
          status: 'current'
        })
      `, {
        id: law.id,
        title: law.title,
        lawNumber: law.metadata?.lawNumber || null,
        lawType: law.lawType,
        effectiveDate: law.effectiveDate?.toISOString() || null,
        promulgationDate: law.promulgationDate?.toISOString() || null
      });
    }
    console.log(`✓ ${laws.length}件の法令を移行しました`);

    // 2. 条文データの移行
    console.log('\n[2/5] 条文データを移行中...');
    const articles = await prisma.article.findMany({
      include: {
        law: true
      }
    });

    // バッチ処理で効率化
    const articleBatch = articles.map(article => ({
      id: article.id,
      lawId: article.lawId,
      number: article.articleNumber,
      title: article.articleTitle,
      content: article.content,
      part: article.part,
      chapter: article.chapter,
      section: article.section,
      subsection: article.subsection,
      division: article.division
    }));

    await session.run(`
      UNWIND $articles AS article
      MATCH (l:Law {id: article.lawId})
      CREATE (a:Article {
        id: article.id,
        lawId: article.lawId,
        number: article.number,
        title: article.title,
        content: article.content,
        part: article.part,
        chapter: article.chapter,
        section: article.section,
        subsection: article.subsection,
        division: article.division
      })
      CREATE (l)-[:HAS_ARTICLE]->(a)
    `, { articles: articleBatch });

    console.log(`✓ ${articles.length}件の条文を移行しました`);

    // 3. 項データの移行
    console.log('\n[3/5] 項データを移行中...');
    const paragraphs = await prisma.paragraph.findMany({
      include: {
        article: true
      }
    });

    const paragraphBatch = paragraphs.map(para => ({
      id: para.id,
      articleId: para.articleId,
      number: para.paragraphNumber,
      content: para.content
    }));

    await session.run(`
      UNWIND $paragraphs AS para
      MATCH (a:Article {id: para.articleId})
      CREATE (p:Paragraph {
        id: para.id,
        articleId: para.articleId,
        number: para.number,
        content: para.content
      })
      CREATE (a)-[:HAS_PARAGRAPH]->(p)
    `, { paragraphs: paragraphBatch });

    console.log(`✓ ${paragraphs.length}件の項を移行しました`);

    // 4. 号データの移行
    console.log('\n[4/5] 号データを移行中...');
    const items = await prisma.item.findMany({
      include: {
        paragraph: true
      }
    });

    const itemBatch = items.map(item => ({
      id: item.id,
      paragraphId: item.paragraphId,
      number: item.itemNumber,
      content: item.content
    }));

    await session.run(`
      UNWIND $items AS item
      MATCH (p:Paragraph {id: item.paragraphId})
      CREATE (i:Item {
        id: item.id,
        paragraphId: item.paragraphId,
        number: item.number,
        content: item.content
      })
      CREATE (p)-[:HAS_ITEM]->(i)
    `, { items: itemBatch });

    console.log(`✓ ${items.length}件の号を移行しました`);

    // 5. 参照関係の移行
    console.log('\n[5/5] 参照関係を移行中...');
    const references = await prisma.reference.findMany({
      include: {
        fromArticle: true,
        toArticle: true
      }
    });

    let refCount = 0;
    for (const ref of references) {
      try {
        if (ref.referenceType === 'internal' && ref.toArticleId) {
          // 内部参照
          await session.run(`
            MATCH (from:Article {id: $fromId})
            MATCH (to:Article {id: $toId})
            CREATE (from)-[:REFERS_TO {
              type: $type,
              subType: $subType,
              text: $text,
              confidence: $confidence
            }]->(to)
          `, {
            fromId: ref.fromArticleId,
            toId: ref.toArticleId,
            type: ref.referenceType,
            subType: ref.referenceSubType,
            text: ref.referenceText,
            confidence: ref.confidence || 0.9
          });
          refCount++;
        } else if (ref.referenceType === 'external' && ref.toLawId) {
          // 外部参照
          await session.run(`
            MATCH (from:Article {id: $fromId})
            MATCH (toLaw:Law {id: $toLawId})
            CREATE (from)-[:REFERS_TO_EXTERNAL {
              type: $type,
              lawName: $lawName,
              articleNumber: $articleNumber,
              text: $text,
              confidence: $confidence
            }]->(toLaw)
          `, {
            fromId: ref.fromArticleId,
            toLawId: ref.toLawId,
            type: ref.referenceType,
            lawName: ref.targetLawName,
            articleNumber: ref.targetArticleNumber,
            text: ref.referenceText,
            confidence: ref.confidence || 0.9
          });
          refCount++;
        } else if (ref.referenceType === 'relative') {
          // 相対参照
          if (ref.toArticleId) {
            await session.run(`
              MATCH (from:Article {id: $fromId})
              MATCH (to:Article {id: $toId})
              CREATE (from)-[:RELATIVE_REF {
                direction: $direction,
                distance: $distance,
                type: '条',
                text: $text
              }]->(to)
            `, {
              fromId: ref.fromArticleId,
              toId: ref.toArticleId,
              direction: ref.relativeDirection,
              distance: ref.relativeCount || 1,
              text: ref.referenceText
            });
            refCount++;
          }
        } else if (ref.referenceType === 'application') {
          // 準用関係
          if (ref.toArticleId) {
            await session.run(`
              MATCH (from:Article {id: $fromId})
              MATCH (to:Article {id: $toId})
              CREATE (from)-[:APPLIES {
                type: '準用',
                text: $text
              }]->(to)
            `, {
              fromId: ref.fromArticleId,
              toId: ref.toArticleId,
              text: ref.referenceText
            });
            refCount++;
          }
        }
      } catch (error) {
        console.error(`参照関係の移行エラー: ${ref.id}`, error);
      }
    }

    console.log(`✓ ${refCount}件の参照関係を移行しました`);

    // 統計情報の表示
    console.log('\n📊 移行完了統計:');
    const stats = await session.run(`
      CALL {
        MATCH (l:Law) RETURN 'Laws' as type, count(l) as count
        UNION ALL
        MATCH (a:Article) RETURN 'Articles' as type, count(a) as count
        UNION ALL
        MATCH (p:Paragraph) RETURN 'Paragraphs' as type, count(p) as count
        UNION ALL
        MATCH (i:Item) RETURN 'Items' as type, count(i) as count
        UNION ALL
        MATCH ()-[r:REFERS_TO]->() RETURN 'Internal References' as type, count(r) as count
        UNION ALL
        MATCH ()-[r:REFERS_TO_EXTERNAL]->() RETURN 'External References' as type, count(r) as count
        UNION ALL
        MATCH ()-[r:RELATIVE_REF]->() RETURN 'Relative References' as type, count(r) as count
        UNION ALL
        MATCH ()-[r:APPLIES]->() RETURN 'Application References' as type, count(r) as count
      }
      RETURN type, count
      ORDER BY type
    `);

    stats.records.forEach(record => {
      console.log(`  ${record.get('type')}: ${record.get('count').toNumber()}`);
    });

    console.log('\n✅ データ移行が完了しました！');

  } catch (error) {
    console.error('移行中にエラーが発生しました:', error);
    throw error;
  } finally {
    await session.close();
    await closeNeo4jDriver();
    await prisma.$disconnect();
  }
}

// メイン処理
migrateToNeo4j().catch(console.error);