#!/usr/bin/env npx tsx
/**
 * 項（Paragraph）と号（Item）の重複表示を修正
 * 項のcontentに号の内容が重複して含まれている問題を解決
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/**
 * 条文のParagraphとItemを正しく解析して更新
 */
async function fixArticleParagraphs(lawId: string, articleNumber: string) {
  // 法令のXMLを取得
  const law = await prisma.law.findUnique({
    where: { id: lawId },
    select: { xmlContent: true }
  });
  
  if (!law) {
    console.log(`法令 ${lawId} が見つかりません`);
    return;
  }
  
  // 該当条文のXMLを抽出
  const articleRegex = new RegExp(
    `<Article\\s+Num="${articleNumber}"[^>]*>([\\s\\S]*?)<\\/Article>`,
    'g'
  );
  const articleMatch = articleRegex.exec(law.xmlContent);
  
  if (!articleMatch) {
    console.log(`第${articleNumber}条が見つかりません`);
    return;
  }
  
  const articleContent = articleMatch[1];
  
  // 条文IDを取得
  const article = await prisma.article.findFirst({
    where: {
      lawId,
      articleNumber
    },
    include: {
      paragraphs: {
        include: {
          items: true
        }
      }
    }
  });
  
  if (!article) {
    console.log(`データベースに第${articleNumber}条が見つかりません`);
    return;
  }
  
  // 既存のParagraphとItemを削除
  await prisma.item.deleteMany({
    where: {
      paragraphId: {
        in: article.paragraphs.map(p => p.id)
      }
    }
  });
  
  await prisma.paragraph.deleteMany({
    where: {
      articleId: article.id
    }
  });
  
  // Paragraphを正しく解析して再作成
  const paragraphMatches = articleContent.matchAll(
    /<Paragraph(?:\s+Num="(\d+)")?[^>]*>([\s\S]*?)<\/Paragraph>/g
  );
  
  let paragraphNum = 1;
  for (const pMatch of paragraphMatches) {
    const paragraphContent = pMatch[2];
    
    // ParagraphSentenceのみを抽出（Itemは含めない）
    let paragraphText = '';
    const sentenceMatch = paragraphContent.match(
      /<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/
    );
    
    if (sentenceMatch) {
      // Sentenceタグ内のテキストを抽出
      const sentences = sentenceMatch[1].matchAll(
        /<Sentence[^>]*>([^<]+)<\/Sentence>/g
      );
      const sentenceTexts = [];
      for (const s of sentences) {
        sentenceTexts.push(s[1]);
      }
      paragraphText = sentenceTexts.join('');
    }
    
    // Paragraphを作成
    const createdParagraph = await prisma.paragraph.create({
      data: {
        articleId: article.id,
        paragraphNumber: paragraphNum,
        content: paragraphText
      }
    });
    
    // Itemを抽出して作成
    const itemMatches = paragraphContent.matchAll(
      /<Item(?:\s+Num="(\d+)")?[^>]*>([\s\S]*?)<\/Item>/g
    );
    
    for (const itemMatch of itemMatches) {
      const itemNum = itemMatch[1];
      const itemContent = itemMatch[2];
      
      // ItemTitleを抽出
      const titleMatch = itemContent.match(/<ItemTitle>([^<]+)<\/ItemTitle>/);
      const itemTitle = titleMatch ? titleMatch[1] : `${itemNum}`;
      
      // ItemSentenceを抽出
      let itemText = '';
      const itemSentenceMatch = itemContent.match(
        /<ItemSentence>([\s\S]*?)<\/ItemSentence>/
      );
      
      if (itemSentenceMatch) {
        const sentences = itemSentenceMatch[1].matchAll(
          /<Sentence[^>]*>([^<]+)<\/Sentence>/g
        );
        const sentenceTexts = [];
        for (const s of sentences) {
          sentenceTexts.push(s[1]);
        }
        itemText = sentenceTexts.join('');
      }
      
      await prisma.item.create({
        data: {
          paragraphId: createdParagraph.id,
          itemNumber: itemTitle,
          content: itemText
        }
      });
    }
    
    paragraphNum++;
  }
  
  // ログを削減（100条ごとに表示）
  if (parseInt(articleNumber) % 100 === 0) {
    console.log(`✅ 第${articleNumber}条まで処理完了`);
  }
}

/**
 * すべての条文を修正
 */
async function fixAllArticles(lawId: string) {
  const articles = await prisma.article.findMany({
    where: { lawId },
    select: { articleNumber: true },
    orderBy: { sortOrder: 'asc' }
  });
  
  console.log(`📚 ${articles.length}条文を処理します...`);
  
  for (const article of articles) {
    await fixArticleParagraphs(lawId, article.articleNumber);
  }
  
  console.log(`✅ ${articles.length}条文の処理が完了しました`);
}

/**
 * メイン処理
 */
async function main() {
  try {
    console.log('🔧 項と号の重複表示を修正中...\n');
    
    // 民法のすべての条文を修正
    console.log('民法のすべての条文を修正します...');
    await fixAllArticles('129AC0000000089');
    
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n✅ 修正完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ エラー:', error);
    process.exit(1);
  });