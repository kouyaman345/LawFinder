"""
政府標準法令XMLパーサー
"""
import xml.etree.ElementTree as ET
from datetime import datetime, date
from typing import List, Optional, Dict, Any
from pathlib import Path
import re

from ..models.law import (
    Law, LawType, Article, Paragraph, Item, 
    SupplProvision, Reference, ReferenceType
)


class LawXMLParser:
    """法令XMLパーサー"""
    
    def __init__(self):
        self.era_mapping = {
            "Meiji": "明治",
            "Taisho": "大正", 
            "Showa": "昭和",
            "Heisei": "平成",
            "Reiwa": "令和"
        }
        
        self.law_type_mapping = {
            "Act": LawType.ACT,
            "CabinetOrder": LawType.CABINET_ORDER,
            "Ordinance": LawType.ORDINANCE,
            "ImperialOrdinance": LawType.IMPERIAL_ORDINANCE,
            "Rule": LawType.RULE
        }
    
    def parse_law_file(self, file_path: Path) -> Law:
        """法令XMLファイルをパース"""
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # 法令メタデータの取得
        law_attrs = root.attrib
        era = law_attrs.get('Era', '')
        year = int(law_attrs.get('Year', 0))
        law_type = self.law_type_mapping.get(law_attrs.get('LawType', ''), LawType.OTHER)
        num = int(law_attrs.get('Num', 0))
        
        # 公布日の取得
        promulgate_month = int(law_attrs.get('PromulgateMonth', 1))
        promulgate_day = int(law_attrs.get('PromulgateDay', 1))
        promulgate_date = self._convert_to_gregorian_date(era, year, promulgate_month, promulgate_day)
        
        # 法令本体の解析
        law_body = root.find('LawBody')
        law_num_elem = root.find('LawNum')
        law_title_elem = law_body.find('LawTitle')
        
        # 法令IDの生成（ファイル名から）
        law_id = file_path.stem.split('_')[0]
        
        law = Law(
            law_id=law_id,
            law_type=law_type,
            law_num=law_num_elem.text if law_num_elem is not None else '',
            law_title=law_title_elem.text if law_title_elem is not None else '',
            law_title_kana=law_title_elem.get('Kana', '') if law_title_elem is not None else None,
            abbreviation=law_title_elem.get('Abbrev', '') if law_title_elem is not None else None,
            era=self.era_mapping.get(era, era),
            year=year,
            num=num,
            promulgate_date=promulgate_date
        )
        
        return law
    
    def parse_articles(self, file_path: Path, law_id: str) -> List[Article]:
        """条文を解析"""
        tree = ET.parse(file_path)
        root = tree.getroot()
        law_body = root.find('LawBody')
        
        articles = []
        
        # MainProvisionの解析
        main_provision = law_body.find('MainProvision')
        if main_provision is not None:
            articles.extend(self._parse_articles_from_element(main_provision, law_id))
        
        # Chapterごとの解析
        for chapter in law_body.findall('Chapter'):
            articles.extend(self._parse_articles_from_element(chapter, law_id))
        
        return articles
    
    def _parse_articles_from_element(self, element: ET.Element, law_id: str) -> List[Article]:
        """要素から条文を解析"""
        articles = []
        
        # 直接のArticle要素
        for article_elem in element.findall('Article'):
            article = self._parse_article(article_elem, law_id)
            if article:
                articles.append(article)
        
        # 直接のParagraph要素（条番号なし）
        paragraphs = element.findall('Paragraph')
        if paragraphs and not element.findall('Article'):
            # 本則の項のみの場合
            article_id = f"{law_id}_main"
            article = Article(
                article_id=article_id,
                law_id=law_id,
                article_num=0,
                content='',
                paragraphs=[]
            )
            
            for para_elem in paragraphs:
                paragraph = self._parse_paragraph(para_elem, article_id)
                if paragraph:
                    article.paragraphs.append(paragraph)
                    if not article.content:
                        article.content = paragraph.content
            
            articles.append(article)
        
        return articles
    
    def _parse_article(self, article_elem: ET.Element, law_id: str) -> Optional[Article]:
        """条要素を解析"""
        article_num_str = article_elem.get('Num', '0')
        
        # 条番号の解析（第二条ノ二のような形式にも対応）
        if '_' in article_num_str:
            article_num = int(article_num_str.split('_')[0])
        else:
            article_num = int(article_num_str)
        
        article_id = f"{law_id}_art{article_num_str}"
        
        # 条見出しとキャプション
        article_title_elem = article_elem.find('ArticleTitle')
        article_caption_elem = article_elem.find('ArticleCaption')
        
        article = Article(
            article_id=article_id,
            law_id=law_id,
            article_num=article_num,
            article_title=article_title_elem.text if article_title_elem is not None else None,
            article_caption=article_caption_elem.text if article_caption_elem is not None else None,
            content='',
            paragraphs=[]
        )
        
        # 項の解析
        for para_elem in article_elem.findall('Paragraph'):
            paragraph = self._parse_paragraph(para_elem, article_id)
            if paragraph:
                article.paragraphs.append(paragraph)
                if not article.content:
                    article.content = paragraph.content
        
        return article
    
    def _parse_paragraph(self, para_elem: ET.Element, article_id: str) -> Optional[Paragraph]:
        """項要素を解析"""
        para_num = int(para_elem.get('Num', '1'))
        paragraph_id = f"{article_id}_para{para_num}"
        
        # 項の内容を取得
        para_sentence_elem = para_elem.find('ParagraphSentence')
        content = ''
        if para_sentence_elem is not None:
            sentences = para_sentence_elem.findall('Sentence')
            content = ' '.join(s.text for s in sentences if s.text)
        
        paragraph = Paragraph(
            paragraph_id=paragraph_id,
            article_id=article_id,
            paragraph_num=para_num,
            content=content,
            items=[]
        )
        
        # 号の解析
        for item_elem in para_elem.findall('Item'):
            item = self._parse_item(item_elem, paragraph_id)
            if item:
                paragraph.items.append(item)
        
        return paragraph
    
    def _parse_item(self, item_elem: ET.Element, paragraph_id: str) -> Optional[Item]:
        """号要素を解析"""
        item_num = int(item_elem.get('Num', '1'))
        item_id = f"{paragraph_id}_item{item_num}"
        
        # 号見出しと内容
        item_title_elem = item_elem.find('ItemTitle')
        item_sentence_elem = item_elem.find('ItemSentence')
        
        content = ''
        if item_sentence_elem is not None:
            sentences = item_sentence_elem.findall('Sentence')
            content = ' '.join(s.text for s in sentences if s.text)
        
        return Item(
            item_id=item_id,
            paragraph_id=paragraph_id,
            item_num=item_num,
            item_title=item_title_elem.text if item_title_elem is not None else str(item_num),
            content=content
        )
    
    def _convert_to_gregorian_date(self, era: str, year: int, month: int, day: int) -> date:
        """和暦を西暦に変換"""
        # 簡易実装（実際はより詳細な変換テーブルが必要）
        era_start_years = {
            "Meiji": 1868,
            "Taisho": 1912,
            "Showa": 1926,
            "Heisei": 1989,
            "Reiwa": 2019
        }
        
        start_year = era_start_years.get(era, 1868)
        gregorian_year = start_year + year - 1
        
        return date(gregorian_year, month, day)
    
    def parse_suppl_provisions(self, file_path: Path, law_id: str) -> List[SupplProvision]:
        """附則を解析"""
        tree = ET.parse(file_path)
        root = tree.getroot()
        law_body = root.find('LawBody')
        
        suppl_provisions = []
        
        for suppl_elem in law_body.findall('SupplProvision'):
            suppl_provision = self._parse_suppl_provision(suppl_elem, law_id)
            if suppl_provision:
                suppl_provisions.append(suppl_provision)
        
        return suppl_provisions
    
    def _parse_suppl_provision(self, suppl_elem: ET.Element, law_id: str) -> Optional[SupplProvision]:
        """附則要素を解析"""
        amend_law_num = suppl_elem.get('AmendLawNum')
        suppl_type = suppl_elem.get('Type', 'New')
        extract = suppl_elem.get('Extract', 'false') == 'true'
        
        suppl_provision_id = f"{law_id}_suppl_{suppl_type}"
        if amend_law_num:
            suppl_provision_id += f"_{amend_law_num.replace(' ', '_')}"
        
        suppl_provision = SupplProvision(
            suppl_provision_id=suppl_provision_id,
            law_id=law_id,
            amend_law_num=amend_law_num,
            suppl_provision_type=suppl_type,
            extract=extract,
            articles=[],
            paragraphs=[]
        )
        
        # 附則の条文を解析
        for article_elem in suppl_elem.findall('Article'):
            article = self._parse_article(article_elem, law_id)
            if article:
                suppl_provision.articles.append(article)
        
        # 附則の項を解析
        for para_elem in suppl_elem.findall('Paragraph'):
            paragraph = self._parse_paragraph(para_elem, suppl_provision_id)
            if paragraph:
                suppl_provision.paragraphs.append(paragraph)
        
        return suppl_provision