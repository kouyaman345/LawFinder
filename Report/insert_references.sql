INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第1条'),
  '129AC0000000089',
  '第明治二十九年法律第八十九号条',
  '民法（明治二十九年法律第八十九号）',
  'external',
  1.0
);

INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第5条'),
  '132AC0000000048',
  NULL,
  '前条',
  'relative',
  1.0
);

INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第7条'),
  '132AC0000000048',
  NULL,
  '前条',
  'relative',
  1.0
);

INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第8条'),
  '300AC0000000000',
  '第昭和三十八年法律第百二十五号条',
  '商業登記法（昭和三十八年法律第百二十五号）',
  'external',
  1.0
);

INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第12条'),
  '132AC0000000048',
  NULL,
  '前項',
  'relative',
  1.0
);

INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第13条'),
  '132AC0000000048',
  NULL,
  '前条',
  'relative',
  1.0
);

INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第15条'),
  '132AC0000000048',
  NULL,
  '前項',
  'relative',
  1.0
);

INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第16条'),
  'UNKNOWN',
  '第二百五十二条',
  '地方自治法（昭和二十二年法律第六十七号）第二百五十二条',
  'external',
  1.0
);

INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第16条'),
  '300AC0000000000',
  '第昭和二十二年法律第六十七号条',
  '地方自治法（昭和二十二年法律第六十七号）',
  'external',
  1.0
);

INSERT INTO "Reference" (
  "sourceLawId", "sourceArticleId", "targetLawId", "targetArticleNumber", 
  "text", "type", "confidence"
) VALUES (
  '132AC0000000048', 
  (SELECT id FROM "Article" WHERE "lawId" = '132AC0000000048' AND "articleNumber" = '第16条'),
  '132AC0000000048',
  NULL,
  '前二項',
  'relative',
  1.0
);