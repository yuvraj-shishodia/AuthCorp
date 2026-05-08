-- AuthCorp Database Schema
-- Digital forensics platform with comprehensive audit trail

-- Users and authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'analyst',
    mfa_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Upload tracking with consent
CREATE TABLE uploads (
    id SERIAL PRIMARY KEY,
    upload_id VARCHAR(64) UNIQUE NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    consent_hash VARCHAR(64) NOT NULL,
    consent_timestamp TIMESTAMP NOT NULL,
    uploader_id INTEGER REFERENCES users(id),
    storage_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ttl_days INTEGER DEFAULT 30,
    deleted_at TIMESTAMP
);

-- Processing jobs
CREATE TABLE processing_jobs (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES uploads(id),
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    worker_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Detector results
CREATE TABLE detector_results (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES uploads(id),
    detector_name VARCHAR(100) NOT NULL,
    detector_version VARCHAR(20) NOT NULL,
    result_id VARCHAR(64) UNIQUE NOT NULL,
    score DECIMAL(5,4) NOT NULL,
    map_path VARCHAR(500),
    boxes JSONB,
    diagnostic JSONB,
    runtime_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fusion results
CREATE TABLE fusion_results (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES uploads(id),
    authenticity_score INTEGER NOT NULL,
    category VARCHAR(50) NOT NULL,
    recommended_action VARCHAR(50) NOT NULL,
    contributions JSONB NOT NULL,
    model_version VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OCR results
CREATE TABLE ocr_results (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES uploads(id),
    extracted_text TEXT NOT NULL,
    confidence_score DECIMAL(5,4),
    processing_time_ms INTEGER,
    language VARCHAR(10),
    entities JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risk assessment
CREATE TABLE risk_assessments (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES uploads(id),
    risk_score INTEGER NOT NULL,
    risk_category VARCHAR(50) NOT NULL,
    risk_factors JSONB,
    entity_matches JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Manual review queue
CREATE TABLE review_queue (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES uploads(id),
    priority INTEGER DEFAULT 1,
    assigned_to INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Review decisions
CREATE TABLE review_decisions (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES uploads(id),
    reviewer_id INTEGER REFERENCES users(id),
    verdict VARCHAR(20) NOT NULL,
    confidence_score INTEGER,
    comments TEXT,
    override_reason VARCHAR(200),
    time_to_decision_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs (append-only)
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(64),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reports
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES uploads(id),
    report_type VARCHAR(50) NOT NULL,
    report_path VARCHAR(500) NOT NULL,
    format VARCHAR(10) NOT NULL,
    generated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Model registry
CREATE TABLE model_registry (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(20) NOT NULL,
    model_hash VARCHAR(64) NOT NULL,
    model_path VARCHAR(500) NOT NULL,
    performance_metrics JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT TRUE
);

-- Create indexes for performance
CREATE INDEX idx_uploads_sha256 ON uploads(sha256_hash);
CREATE INDEX idx_uploads_created_at ON uploads(created_at);
CREATE INDEX idx_detector_results_upload_id ON detector_results(upload_id);
CREATE INDEX idx_fusion_results_upload_id ON fusion_results(upload_id);
CREATE INDEX idx_review_queue_status ON review_queue(status);
CREATE INDEX idx_review_queue_assigned_to ON review_queue(assigned_to);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- Insert default admin user (password: admin123 - change in production)
INSERT INTO users (username, email, password_hash, role) VALUES 
('admin', 'admin@authcorp.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PJ/..G', 'admin');