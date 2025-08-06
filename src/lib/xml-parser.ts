/**
 * XML Parser for Japanese Law Documents
 * 静的サイト生成スクリプトから移植
 */

export interface LawArticle {
  articleNum: string;
  articleTitle: string | null;
  paragraphs: Paragraph[];
}

export interface Paragraph {
  content: string;
  items: Item[];
}

export interface Item {
  title: string;
  content: string;
  subitems?: SubItem[];
}

export interface SubItem {
  title: string;
  content: string;
  subsubitems?: SubSubItem[];
}

export interface SubSubItem {
  title: string;
  content: string;
}

export interface LawData {
  lawId: string;
  lawTitle: string;
  lawNum: string;
  lawType: string;
  articles: LawArticle[];
  structure: LawStructure;
  promulgateDate: Date;
}

export interface LawStructure {
  parts: Part[];
  chapters: Chapter[];
  sections: Section[];
}

export interface Part {
  num: string;
  title: string;
  chapters: string[];
}

export interface Chapter {
  num: string;
  title: string;
  sections: string[];
  articles: string[];
}

export interface Section {
  num: string;
  title: string;
  articles: string[];
}

export class LawXMLParser {
  parseLawXML(xmlContent: string, filename: string): LawData {
    // 基本情報の抽出
    const lawId = filename.replace('.xml', '');
    const titleMatch = xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    const lawTitle = titleMatch ? titleMatch[1] : '不明な法令';
    
    const lawNumMatch = xmlContent.match(/<LawNum>([^<]+)<\/LawNum>/);
    const lawNum = lawNumMatch ? lawNumMatch[1] : '';
    
    // 階層構造の抽出
    const structure = this.extractStructure(xmlContent);
    
    // 条文の抽出
    const articles = this.extractArticles(xmlContent);
    
    return {
      lawId,
      lawTitle,
      lawNum,
      lawType: 'Act',
      articles,
      structure,
      promulgateDate: new Date()
    };
  }

  private extractStructure(xmlContent: string): LawStructure {
    const structure: LawStructure = {
      parts: [],
      chapters: [],
      sections: []
    };
    
    // 編（Part）の抽出
    const partMatches = Array.from(xmlContent.matchAll(/<Part\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Part>/g));
    for (const match of partMatches) {
      const partNum = match[1];
      const partContent = match[2];
      const titleMatch = partContent.match(/<PartTitle>([^<]+)<\/PartTitle>/);
      
      const part: Part = {
        num: partNum,
        title: titleMatch ? titleMatch[1] : '',
        chapters: []
      };
      
      // この編に含まれる章を抽出
      const chapterMatches = partContent.matchAll(/<Chapter\s+Num="([^"]+)"[^>]*>/g);
      for (const chapMatch of chapterMatches) {
        part.chapters.push(chapMatch[1]);
      }
      
      structure.parts.push(part);
    }
    
    // 章（Chapter）の抽出
    const chapterMatches = Array.from(xmlContent.matchAll(/<Chapter\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Chapter>/g));
    for (const match of chapterMatches) {
      const chapterNum = match[1];
      const chapterContent = match[2];
      const titleMatch = chapterContent.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
      
      const chapter: Chapter = {
        num: chapterNum,
        title: titleMatch ? titleMatch[1] : '',
        sections: [],
        articles: []
      };
      
      // この章に含まれる節を抽出
      const sectionMatches = chapterContent.matchAll(/<Section\s+Num="([^"]+)"[^>]*>/g);
      for (const secMatch of sectionMatches) {
        chapter.sections.push(secMatch[1]);
      }
      
      // この章に直接含まれる条文を抽出
      const articleMatches = chapterContent.matchAll(/<Article\s+Num="([^"]+)"[^>]*>/g);
      for (const artMatch of articleMatches) {
        // 節に含まれていない条文のみ
        const articleNum = artMatch[1];
        const isInSection = chapter.sections.some(secNum => {
          const sectionRegex = new RegExp(`<Section[^>]*Num="${secNum}"[^>]*>[\\s\\S]*?<Article[^>]*Num="${articleNum}"[^>]*>`, 'g');
          return sectionRegex.test(chapterContent);
        });
        if (!isInSection) {
          chapter.articles.push(articleNum);
        }
      }
      
      structure.chapters.push(chapter);
    }
    
    // 節（Section）の抽出
    const sectionMatches = Array.from(xmlContent.matchAll(/<Section\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Section>/g));
    for (const match of sectionMatches) {
      const sectionNum = match[1];
      const sectionContent = match[2];
      const titleMatch = sectionContent.match(/<SectionTitle>([^<]+)<\/SectionTitle>/);
      
      const section: Section = {
        num: sectionNum,
        title: titleMatch ? titleMatch[1] : '',
        articles: []
      };
      
      // この節に含まれる条文を抽出
      const articleMatches = sectionContent.matchAll(/<Article\s+Num="([^"]+)"[^>]*>/g);
      for (const artMatch of articleMatches) {
        section.articles.push(artMatch[1]);
      }
      
      structure.sections.push(section);
    }
    
    return structure;
  }

  private extractArticles(xmlContent: string): LawArticle[] {
    const articles: LawArticle[] = [];
    const articleMatches = xmlContent.matchAll(/<Article\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g);
    
    for (const match of articleMatches) {
      const articleNum = match[1];
      const articleContent = match[2];
      
      const captionMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
      const articleTitle = captionMatch ? captionMatch[1] : null;
      
      const paragraphs = this.extractParagraphs(articleContent);
      
      articles.push({
        articleNum,
        articleTitle,
        paragraphs
      });
    }
    
    return articles;
  }

  private extractParagraphs(articleContent: string): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const paragraphMatches = articleContent.matchAll(/<Paragraph[^>]*>([\s\S]*?)<\/Paragraph>/g);
    
    for (const pMatch of paragraphMatches) {
      const paragraphContent = pMatch[1];
      const paragraph: Paragraph = {
        content: '',
        items: []
      };
      
      // 段落本文のSentenceを抽出
      const paragraphSentenceMatch = paragraphContent.match(/<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/);
      if (paragraphSentenceMatch) {
        const sentenceMatches = paragraphSentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
        const sentences = [];
        for (const sMatch of sentenceMatches) {
          sentences.push(sMatch[1]);
        }
        paragraph.content = sentences.join('\n');
      }
      
      // 号（Item）を抽出
      const itemMatches = paragraphContent.matchAll(/<Item[^>]*>([\s\S]*?)<\/Item>/g);
      for (const itemMatch of itemMatches) {
        const item = this.extractItem(itemMatch[1]);
        paragraph.items.push(item);
      }
      
      if (paragraph.content || paragraph.items.length > 0) {
        paragraphs.push(paragraph);
      }
    }
    
    return paragraphs;
  }

  private extractItem(itemContent: string): Item {
    const item: Item = {
      title: '',
      content: '',
      subitems: []
    };
    
    // ItemTitleを抽出
    const titleMatch = itemContent.match(/<ItemTitle>([^<]+)<\/ItemTitle>/);
    if (titleMatch) {
      item.title = titleMatch[1];
    }
    
    // ItemSentenceを抽出
    const sentenceMatch = itemContent.match(/<ItemSentence>([\s\S]*?)<\/ItemSentence>/);
    if (sentenceMatch) {
      const sentenceMatches = sentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
      const sentences = [];
      for (const sMatch of sentenceMatches) {
        sentences.push(sMatch[1]);
      }
      item.content = sentences.join('\n');
    }
    
    // Subitem1を抽出
    const subitem1Matches = itemContent.matchAll(/<Subitem1[^>]*>([\s\S]*?)<\/Subitem1>/g);
    for (const sub1Match of subitem1Matches) {
      const subitem = this.extractSubitem(sub1Match[1]);
      if (subitem.title || subitem.content) {
        item.subitems = item.subitems || [];
        item.subitems.push(subitem);
      }
    }
    
    return item;
  }

  private extractSubitem(subitemContent: string): SubItem {
    const subitem: SubItem = {
      title: '',
      content: '',
      subsubitems: []
    };
    
    // Subitem1Titleを抽出
    const titleMatch = subitemContent.match(/<Subitem1Title>([^<]+)<\/Subitem1Title>/);
    if (titleMatch) {
      subitem.title = titleMatch[1];
    }
    
    // Subitem1Sentenceを抽出
    const sentenceMatch = subitemContent.match(/<Subitem1Sentence>([\s\S]*?)<\/Subitem1Sentence>/);
    if (sentenceMatch) {
      const sentenceMatches = sentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
      const sentences = [];
      for (const sMatch of sentenceMatches) {
        sentences.push(sMatch[1]);
      }
      subitem.content = sentences.join('\n');
    }
    
    // Subitem2を抽出
    const subitem2Matches = subitemContent.matchAll(/<Subitem2[^>]*>([\s\S]*?)<\/Subitem2>/g);
    for (const sub2Match of subitem2Matches) {
      const subsubitem = this.extractSubsubitem(sub2Match[1]);
      if (subsubitem.title || subsubitem.content) {
        subitem.subsubitems = subitem.subsubitems || [];
        subitem.subsubitems.push(subsubitem);
      }
    }
    
    return subitem;
  }

  private extractSubsubitem(subsubitemContent: string): SubSubItem {
    const subsubitem: SubSubItem = {
      title: '',
      content: ''
    };
    
    const titleMatch = subsubitemContent.match(/<Subitem2Title>([^<]+)<\/Subitem2Title>/);
    if (titleMatch) {
      subsubitem.title = titleMatch[1];
    }
    
    const sentenceMatch = subsubitemContent.match(/<Subitem2Sentence>([\s\S]*?)<\/Subitem2Sentence>/);
    if (sentenceMatch) {
      const sentenceMatches = sentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
      const sentences = [];
      for (const sMatch of sentenceMatches) {
        sentences.push(sMatch[1]);
      }
      subsubitem.content = sentences.join('\n');
    }
    
    return subsubitem;
  }
}