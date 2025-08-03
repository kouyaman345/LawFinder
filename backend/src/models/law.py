"""
法令データモデル定義
"""
from datetime import date
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class LawType(str, Enum):
    """法令種別"""
    ACT = "Act"  # 法律
    CABINET_ORDER = "CabinetOrder"  # 政令
    ORDINANCE = "Ordinance"  # 省令
    IMPERIAL_ORDINANCE = "ImperialOrdinance"  # 勅令
    RULE = "Rule"  # 規則
    OTHER = "Other"  # その他


class ReferenceType(str, Enum):
    """参照種別"""
    APPLY = "準用"
    DEEM = "みなす"
    REPLACE = "読み替え"
    FOLLOW = "なお従う"
    ACCORDING_TO = "による"
    BASED_ON = "基づく"
    OTHER = "その他"


class Law(BaseModel):
    """法令"""
    law_id: str = Field(..., description="法令ID (例: 320AC0000000046)")
    law_type: LawType = Field(..., description="法令種別")
    law_num: str = Field(..., description="法令番号 (例: 昭和二十年法律第四十六号)")
    law_title: str = Field(..., description="法令名")
    law_title_kana: Optional[str] = Field(None, description="法令名読み")
    abbreviation: Optional[str] = Field(None, description="略称")
    era: str = Field(..., description="元号")
    year: int = Field(..., description="年")
    num: int = Field(..., description="号数")
    promulgate_date: date = Field(..., description="公布日")
    enforce_date: Optional[date] = Field(None, description="施行日")
    
    class Config:
        json_encoders = {
            date: lambda v: v.isoformat()
        }


class Article(BaseModel):
    """条"""
    article_id: str = Field(..., description="条ID (例: 320AC0000000046_art1)")
    law_id: str = Field(..., description="法令ID")
    article_num: int = Field(..., description="条番号")
    article_title: Optional[str] = Field(None, description="条見出し")
    article_caption: Optional[str] = Field(None, description="条キャプション")
    content: str = Field(..., description="条文内容")
    paragraphs: List['Paragraph'] = Field(default_factory=list, description="項リスト")


class Paragraph(BaseModel):
    """項"""
    paragraph_id: str = Field(..., description="項ID")
    article_id: str = Field(..., description="条ID")
    paragraph_num: int = Field(..., description="項番号")
    content: str = Field(..., description="項内容")
    items: List['Item'] = Field(default_factory=list, description="号リスト")


class Item(BaseModel):
    """号"""
    item_id: str = Field(..., description="号ID")
    paragraph_id: str = Field(..., description="項ID")
    item_num: int = Field(..., description="号番号")
    item_title: str = Field(..., description="号見出し (例: 一、二、三)")
    content: str = Field(..., description="号内容")


class Reference(BaseModel):
    """参照関係"""
    reference_id: str = Field(..., description="参照関係ID")
    source_law_id: str = Field(..., description="参照元法令ID")
    source_article_id: Optional[str] = Field(None, description="参照元条ID")
    source_paragraph_id: Optional[str] = Field(None, description="参照元項ID")
    source_item_id: Optional[str] = Field(None, description="参照元号ID")
    target_law_id: str = Field(..., description="参照先法令ID")
    target_article_id: Optional[str] = Field(None, description="参照先条ID")
    target_paragraph_id: Optional[str] = Field(None, description="参照先項ID")
    target_item_id: Optional[str] = Field(None, description="参照先号ID")
    reference_type: ReferenceType = Field(..., description="参照種別")
    reference_text: str = Field(..., description="参照テキスト（原文）")
    confidence_score: float = Field(1.0, description="信頼度スコア (0.0-1.0)")
    extracted_at: date = Field(..., description="抽出日時")
    ai_verified: bool = Field(False, description="AI検証済みフラグ")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="メタデータ")


class SupplProvision(BaseModel):
    """附則"""
    suppl_provision_id: str = Field(..., description="附則ID")
    law_id: str = Field(..., description="法令ID")
    amend_law_num: Optional[str] = Field(None, description="改正法令番号")
    suppl_provision_type: str = Field(..., description="附則種別 (New/Amend)")
    extract: bool = Field(False, description="抄フラグ")
    articles: List[Article] = Field(default_factory=list, description="附則条文リスト")
    paragraphs: List[Paragraph] = Field(default_factory=list, description="附則項リスト")


# 循環参照を解決するための更新
Article.model_rebuild()
Paragraph.model_rebuild()