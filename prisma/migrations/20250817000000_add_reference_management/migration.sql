-- アルゴリズムバージョン管理
CREATE TABLE IF NOT EXISTS algorithm_versions (
    id SERIAL PRIMARY KEY,
    version VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT false,
    parent_version VARCHAR(20),
    config JSONB
);

-- 参照検出結果（バージョン管理付き）
CREATE TABLE IF NOT EXISTS reference_detections (
    id SERIAL PRIMARY KEY,
    algorithm_version_id INTEGER REFERENCES algorithm_versions(id),
    source_law_id VARCHAR(50) NOT NULL,
    source_article VARCHAR(50) NOT NULL,
    target_law_id VARCHAR(50),
    target_article VARCHAR(50),
    reference_type VARCHAR(50) NOT NULL,
    reference_text TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    context TEXT,
    metadata JSONB,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_verified BOOLEAN DEFAULT false,
    verification_status VARCHAR(20),
    UNIQUE(algorithm_version_id, source_law_id, source_article, reference_text)
);

-- 検証結果
CREATE TABLE IF NOT EXISTS reference_validations (
    id SERIAL PRIMARY KEY,
    detection_id INTEGER REFERENCES reference_detections(id),
    validation_type VARCHAR(50), -- manual, automated, llm
    is_correct BOOLEAN,
    notes TEXT,
    validated_by VARCHAR(100),
    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- パフォーマンス指標
CREATE TABLE IF NOT EXISTS algorithm_metrics (
    id SERIAL PRIMARY KEY,
    algorithm_version_id INTEGER REFERENCES algorithm_versions(id),
    law_id VARCHAR(50),
    total_references INTEGER,
    detected_references INTEGER,
    false_positives INTEGER,
    false_negatives INTEGER,
    precision FLOAT,
    recall FLOAT,
    f1_score FLOAT,
    processing_time_ms INTEGER,
    measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_reference_detections_version ON reference_detections(algorithm_version_id);
CREATE INDEX IF NOT EXISTS idx_reference_detections_source ON reference_detections(source_law_id, source_article);
CREATE INDEX IF NOT EXISTS idx_reference_detections_target ON reference_detections(target_law_id, target_article);
CREATE INDEX IF NOT EXISTS idx_reference_validations_detection ON reference_validations(detection_id);
CREATE INDEX IF NOT EXISTS idx_algorithm_metrics_version ON algorithm_metrics(algorithm_version_id);
