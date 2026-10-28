-- ============================================================================
-- Supabase Schema for BoatLoad: Mario Maker Style Community UGC Platform
-- Execute this script in your Supabase SQL Editor.
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (Extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(32) NOT NULL UNIQUE,
    avatar_url TEXT,
    maker_score INT NOT NULL DEFAULT 0,
    upload_quota INT NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Community Levels Catalog Table
CREATE TABLE IF NOT EXISTS public.levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_code VARCHAR(12) NOT NULL UNIQUE, -- e.g. 'BL-7K2-MN9'
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    author_name VARCHAR(32) NOT NULL DEFAULT 'Anonymous Shipwright',
    title VARCHAR(48) NOT NULL,
    description VARCHAR(280) DEFAULT '',
    tags TEXT[] DEFAULT ARRAY['adventure']::TEXT[],
    ship_type VARCHAR(24) NOT NULL DEFAULT 'sloop',
    weather VARCHAR(24) NOT NULL DEFAULT 'sunny',
    difficulty VARCHAR(16) NOT NULL DEFAULT 'normal', -- 'casual', 'normal', 'expert', 'super_expert'
    
    -- Engagement & Mario Maker Telemetry
    play_count INT NOT NULL DEFAULT 0,
    attempt_count INT NOT NULL DEFAULT 0,
    clear_count INT NOT NULL DEFAULT 0,
    star_count INT NOT NULL DEFAULT 0,
    
    -- World Record
    first_clear_username VARCHAR(32),
    world_record_time_ms INT,
    world_record_username VARCHAR(32),
    
    -- Payload Storage References
    storage_path TEXT NOT NULL, -- e.g. 'levels/BL-7K2-MN9.json'
    payload_hash VARCHAR(64) NOT NULL,
    payload_size_bytes INT NOT NULL,
    clear_check_time_ms INT NOT NULL,
    
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Player Interaction & Star Table
CREATE TABLE IF NOT EXISTS public.level_interactions (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    level_id UUID REFERENCES public.levels(id) ON DELETE CASCADE,
    has_cleared BOOLEAN NOT NULL DEFAULT FALSE,
    best_time_ms INT,
    has_starred BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INT NOT NULL DEFAULT 1,
    last_played_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, level_id)
);

-- 4. Death Heatmaps (Where player ships sink)
CREATE TABLE IF NOT EXISTS public.level_deaths (
    id BIGSERIAL PRIMARY KEY,
    level_id UUID REFERENCES public.levels(id) ON DELETE CASCADE,
    pos_x REAL NOT NULL,
    pos_z REAL NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for Fast Course Browsing
CREATE INDEX IF NOT EXISTS idx_levels_code ON public.levels (course_code);
CREATE INDEX IF NOT EXISTS idx_levels_trending ON public.levels (star_count DESC, created_at DESC) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_levels_recent ON public.levels (created_at DESC) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_levels_difficulty ON public.levels (difficulty, star_count DESC) WHERE is_public = TRUE;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_deaths ENABLE ROW LEVEL SECURITY;

-- Levels RLS
CREATE POLICY "Public levels are viewable by everyone" 
ON public.levels FOR SELECT USING (is_public = TRUE);

CREATE POLICY "Authenticated users and guests can upload levels" 
ON public.levels FOR INSERT WITH CHECK (true);

CREATE POLICY "Authors can update their own levels" 
ON public.levels FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete their own levels" 
ON public.levels FOR DELETE USING (auth.uid() = author_id);

-- Interactions RLS
CREATE POLICY "Users can manage their own interactions" 
ON public.level_interactions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Anyone can log a death marker" 
ON public.level_deaths FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view death markers" 
ON public.level_deaths FOR SELECT USING (true);

-- ============================================================================
-- Storage Bucket Setup for Level Payloads
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('level-payloads', 'level-payloads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can download level payloads"
ON storage.objects FOR SELECT USING (bucket_id = 'level-payloads');

CREATE POLICY "Anyone can upload level payloads"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'level-payloads');

-- ============================================================================
-- Atomic Telemetry & Counter RPC Functions
-- ============================================================================

-- Atomic course attempt and record updates
CREATE OR REPLACE FUNCTION public.record_course_attempt(
    p_course_code VARCHAR,
    p_cleared BOOLEAN,
    p_time_ms INT,
    p_player_name VARCHAR
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.levels
    SET 
        attempt_count = attempt_count + 1,
        clear_count = CASE WHEN p_cleared THEN clear_count + 1 ELSE clear_count END,
        play_count = play_count + 1,
        world_record_time_ms = CASE 
            WHEN p_cleared AND (world_record_time_ms IS NULL OR (p_time_ms > 0 AND p_time_ms < world_record_time_ms)) 
            THEN p_time_ms 
            ELSE world_record_time_ms 
        END,
        world_record_username = CASE 
            WHEN p_cleared AND (world_record_time_ms IS NULL OR (p_time_ms > 0 AND p_time_ms < world_record_time_ms)) 
            THEN p_player_name 
            ELSE world_record_username 
        END,
        first_clear_username = CASE 
            WHEN p_cleared AND first_clear_username IS NULL 
            THEN p_player_name 
            ELSE first_clear_username 
        END
    WHERE course_code = p_course_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic star counter update
CREATE OR REPLACE FUNCTION public.toggle_course_star(
    p_course_code VARCHAR,
    p_increment INT
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.levels
    SET star_count = GREATEST(0, star_count + p_increment)
    WHERE course_code = p_course_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

