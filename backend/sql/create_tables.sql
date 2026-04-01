-- ============================================
-- Product Analytics Dashboard - Database Schema
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    age INTEGER NOT NULL CHECK (age > 0 AND age < 150),
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_gender ON users (gender);
CREATE INDEX idx_users_age ON users (age);
CREATE INDEX idx_users_is_active ON users (is_active);
CREATE INDEX idx_users_created_at ON users (created_at);

-- 2. Feature Clicks Table
CREATE TABLE IF NOT EXISTS feature_clicks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feature_clicks_user_id ON feature_clicks (user_id);
CREATE INDEX idx_feature_clicks_feature_name ON feature_clicks (feature_name);
CREATE INDEX idx_feature_clicks_timestamp ON feature_clicks (timestamp);
CREATE INDEX idx_feature_clicks_created_at ON feature_clicks (created_at);
CREATE INDEX idx_feature_clicks_user_feature ON feature_clicks (user_id, feature_name);
CREATE INDEX idx_feature_clicks_feature_timestamp ON feature_clicks (feature_name, timestamp);
