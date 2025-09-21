/*
  # Enhanced CivicConnect Database Schema with Complete Workflow

  1. New Tables
    - Enhanced `profiles` with role-based assignments
    - Enhanced `issues` with workflow stages
    - `areas` and `departments` for organizational structure
    - `issue_assignments` for tracking assignments
    - Enhanced `tenders` with department integration
    - Enhanced `bids` with contractor management
    - `work_progress` for tracking contractor work
    - Enhanced `feedback` system

  2. Security
    - Enable RLS on all tables
    - Add comprehensive policies for all user types
    - Add proper workflow stage management

  3. Workflow Stages
    - Issue: reported → area_review → department_assigned → contractor_assigned → work_in_progress → work_completed → verified → resolved
    - Tender: created → available → awarded → work_in_progress → work_completed → verified → completed
*/

-- Create areas table for organizational structure
CREATE TABLE IF NOT EXISTS areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  description text,
  state_id text,
  district_id text,
  boundaries jsonb,
  population integer,
  area_size_km2 decimal(10, 2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  category text NOT NULL CHECK (category IN ('infrastructure', 'environment', 'safety', 'utilities', 'parks', 'administration')),
  description text,
  head_official_id uuid,
  contact_email text,
  contact_phone text,
  office_address text,
  budget_allocation decimal(15, 2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enhanced profiles table with role assignments
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  user_type text NOT NULL DEFAULT 'user' CHECK (user_type IN ('user', 'admin', 'area_super_admin', 'department_admin', 'tender')),
  full_name text,
  first_name text,
  last_name text,
  phone text,
  address text,
  city text,
  state text,
  postal_code text,
  avatar_url text,
  points integer DEFAULT 0,
  is_verified boolean DEFAULT false,
  verified_at timestamptz,
  last_login_at timestamptz,
  assigned_area_id uuid REFERENCES areas(id),
  assigned_department_id uuid REFERENCES departments(id),
  contractor_license text,
  contractor_rating decimal(3, 2) DEFAULT 0.0,
  contractor_specializations text[],
  notification_settings jsonb DEFAULT '{"email": true, "push": true, "sms": false}',
  preferences jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enhanced issues table with workflow stages
CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('roads', 'utilities', 'environment', 'safety', 'parks', 'other')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'in_progress', 'resolved', 'closed', 'rejected')),
  workflow_stage text NOT NULL DEFAULT 'reported' CHECK (workflow_stage IN ('reported', 'area_review', 'department_assigned', 'contractor_assigned', 'work_in_progress', 'work_completed', 'verified', 'resolved')),
  location_name text,
  address text,
  latitude decimal(10, 8),
  longitude decimal(11, 8),
  area text,
  ward text,
  images text[],
  assigned_area_id uuid REFERENCES areas(id),
  assigned_department_id uuid REFERENCES departments(id),
  current_assignee_id uuid REFERENCES profiles(id),
  estimated_resolution_date date,
  resolved_at timestamptz,
  final_resolution_notes text,
  upvotes integer DEFAULT 0,
  downvotes integer DEFAULT 0,
  views_count integer DEFAULT 0,
  tags text[],
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create issue assignments table for tracking workflow
CREATE TABLE IF NOT EXISTS issue_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES issues(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_area_id uuid REFERENCES areas(id),
  assigned_department_id uuid REFERENCES departments(id),
  assignment_type text NOT NULL CHECK (assignment_type IN ('admin_to_area', 'area_to_department', 'department_to_contractor')),
  assignment_notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'reassigned', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enhanced tenders table with department integration
CREATE TABLE IF NOT EXISTS tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  department_id uuid REFERENCES departments(id) NOT NULL,
  source_issue_id uuid REFERENCES issues(id),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  location text NOT NULL,
  area text,
  ward text,
  estimated_budget_min decimal(15, 2),
  estimated_budget_max decimal(15, 2),
  deadline_date date NOT NULL,
  submission_deadline timestamptz NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('draft', 'available', 'bidding_closed', 'awarded', 'completed', 'cancelled')),
  workflow_stage text NOT NULL DEFAULT 'created' CHECK (workflow_stage IN ('created', 'available', 'awarded', 'work_in_progress', 'work_completed', 'verified', 'completed')),
  requirements text[],
  documents text[],
  awarded_contractor_id uuid REFERENCES profiles(id),
  awarded_amount decimal(15, 2),
  awarded_at timestamptz,
  work_started_at timestamptz,
  completion_date timestamptz,
  verification_notes text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enhanced bids table
CREATE TABLE IF NOT EXISTS bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id uuid REFERENCES tenders(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount decimal(15, 2) NOT NULL,
  details text NOT NULL,
  timeline text,
  methodology text,
  team_details text,
  documents text[],
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn')),
  evaluation_score decimal(5, 2),
  evaluation_notes text,
  submitted_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tender_id, user_id)
);

-- Create work progress table for contractor work tracking
CREATE TABLE IF NOT EXISTS work_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id uuid REFERENCES tenders(id) ON DELETE CASCADE NOT NULL,
  contractor_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  progress_type text NOT NULL CHECK (progress_type IN ('start', 'milestone', 'completion')),
  title text NOT NULL,
  description text NOT NULL,
  progress_percentage integer DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  images text[],
  materials_used text[],
  challenges_faced text,
  next_steps text,
  requires_verification boolean DEFAULT false,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'under_review')),
  verified_by uuid REFERENCES profiles(id),
  verified_at timestamptz,
  verification_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enhanced community posts table
CREATE TABLE IF NOT EXISTS community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'discussions' CHECK (category IN ('discussions', 'announcements', 'suggestions', 'events')),
  tags text[],
  images text[],
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  is_official boolean DEFAULT false,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enhanced feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  issue_id uuid REFERENCES issues(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('complaint', 'suggestion', 'compliment', 'inquiry')),
  subject text NOT NULL,
  message text NOT NULL,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'under_review', 'responded', 'resolved')),
  admin_response text,
  responded_by uuid REFERENCES profiles(id),
  responded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Municipal officials table
CREATE TABLE IF NOT EXISTS municipal_officials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text NOT NULL,
  department text NOT NULL,
  sub_department text,
  email text,
  phone text,
  whatsapp_number text,
  office_address text,
  office_hours text,
  responsibilities text[],
  specializations text[],
  bio text,
  languages_spoken text[],
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL CHECK (type IN ('issue_update', 'tender_update', 'bid_update', 'assignment', 'system')),
  related_id uuid,
  related_type text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Issue votes table
CREATE TABLE IF NOT EXISTS issue_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES issues(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  vote_type text NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(issue_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipal_officials ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_votes ENABLE ROW LEVEL SECURITY;

-- Areas policies
CREATE POLICY "Anyone can read active areas"
  ON areas FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage areas"
  ON areas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Departments policies
CREATE POLICY "Anyone can read active departments"
  ON departments FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage departments"
  ON departments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Profiles policies
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin', 'department_admin')
    )
  );

CREATE POLICY "Public profile data for leaderboard"
  ON profiles FOR SELECT TO authenticated
  USING (true);

-- Issues policies
CREATE POLICY "Anyone can read issues"
  ON issues FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Verified users can create issues"
  ON issues FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own issues"
  ON issues FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and assigned users can update issues"
  ON issues FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id OR
    auth.uid() = current_assignee_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin', 'department_admin')
    )
  );

-- Issue assignments policies
CREATE POLICY "Anyone can read assignments"
  ON issue_assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authorized users can create assignments"
  ON issue_assignments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = assigned_by AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('admin', 'area_super_admin', 'department_admin')
    )
  );

-- Tenders policies
CREATE POLICY "Anyone can read available tenders"
  ON tenders FOR SELECT TO authenticated
  USING (status IN ('available', 'awarded', 'completed'));

CREATE POLICY "Department admins can manage their tenders"
  ON tenders FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() 
      AND (
        p.user_type = 'admin' OR
        (p.user_type = 'department_admin' AND p.assigned_department_id = department_id)
      )
    )
  );

-- Bids policies
CREATE POLICY "Contractors can read relevant bids"
  ON bids FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN tenders t ON t.id = tender_id
      WHERE p.id = auth.uid() 
      AND (
        p.user_type = 'admin' OR
        (p.user_type = 'department_admin' AND p.assigned_department_id = t.department_id)
      )
    )
  );

CREATE POLICY "Verified contractors can create bids"
  ON bids FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'tender' AND is_verified = true
    )
  );

CREATE POLICY "Department admins can update bids"
  ON bids FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN tenders t ON t.id = tender_id
      WHERE p.id = auth.uid() 
      AND (
        p.user_type = 'admin' OR
        (p.user_type = 'department_admin' AND p.assigned_department_id = t.department_id)
      )
    )
  );

-- Work progress policies
CREATE POLICY "Contractors can manage their work progress"
  ON work_progress FOR ALL TO authenticated
  USING (auth.uid() = contractor_id);

CREATE POLICY "Department admins can read and verify work progress"
  ON work_progress FOR SELECT TO authenticated
  USING (
    auth.uid() = contractor_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN tenders t ON t.id = tender_id
      WHERE p.id = auth.uid() 
      AND (
        p.user_type = 'admin' OR
        (p.user_type = 'department_admin' AND p.assigned_department_id = t.department_id)
      )
    )
  );

CREATE POLICY "Department admins can verify work progress"
  ON work_progress FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN tenders t ON t.id = tender_id
      WHERE p.id = auth.uid() 
      AND (
        p.user_type = 'admin' OR
        (p.user_type = 'department_admin' AND p.assigned_department_id = t.department_id)
      )
    )
  );

-- Community posts policies
CREATE POLICY "Anyone can read community posts"
  ON community_posts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Verified users can create posts"
  ON community_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Feedback policies
CREATE POLICY "Users can read own feedback"
  ON feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can create feedback"
  ON feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can manage feedback"
  ON feedback FOR ALL TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Municipal officials policies
CREATE POLICY "Anyone can read active officials"
  ON municipal_officials FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage officials"
  ON municipal_officials FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- Notifications policies
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Issue votes policies
CREATE POLICY "Anyone can read votes"
  ON issue_votes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can manage own votes"
  ON issue_votes FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_area ON profiles(assigned_area_id);
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_department ON profiles(assigned_department_id);

CREATE INDEX IF NOT EXISTS idx_issues_workflow_stage ON issues(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_issues_assigned_department ON issues(assigned_department_id);
CREATE INDEX IF NOT EXISTS idx_issues_assigned_area ON issues(assigned_area_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);

CREATE INDEX IF NOT EXISTS idx_issue_assignments_issue_id ON issue_assignments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_assignments_assigned_to ON issue_assignments(assigned_to);

CREATE INDEX IF NOT EXISTS idx_tenders_department_id ON tenders(department_id);
CREATE INDEX IF NOT EXISTS idx_tenders_status ON tenders(status);
CREATE INDEX IF NOT EXISTS idx_tenders_workflow_stage ON tenders(workflow_stage);

CREATE INDEX IF NOT EXISTS idx_bids_tender_id ON bids(tender_id);
CREATE INDEX IF NOT EXISTS idx_bids_user_id ON bids(user_id);
CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status);

CREATE INDEX IF NOT EXISTS idx_work_progress_tender_id ON work_progress(tender_id);
CREATE INDEX IF NOT EXISTS idx_work_progress_contractor_id ON work_progress(contractor_id);

-- Insert sample areas
INSERT INTO areas (name, code, description, is_active) VALUES
('Downtown District', 'DD01', 'Central business district with high commercial activity', true),
('Residential North', 'RN02', 'Northern residential area with family neighborhoods', true),
('Industrial Zone', 'IZ03', 'Industrial and manufacturing zone', true),
('Suburban East', 'SE04', 'Eastern suburban area with mixed development', true),
('Historic Quarter', 'HQ05', 'Historic downtown area with heritage buildings', true)
ON CONFLICT (code) DO NOTHING;

-- Insert sample departments
INSERT INTO departments (name, code, category, description, is_active) VALUES
('Public Works Department', 'PWD', 'infrastructure', 'Responsible for roads, bridges, and infrastructure maintenance', true),
('Water & Utilities Department', 'WUD', 'utilities', 'Manages water supply, sewage, and utility services', true),
('Parks & Recreation Department', 'PRD', 'parks', 'Maintains parks, recreational facilities, and green spaces', true),
('Environmental Services', 'ENV', 'environment', 'Handles waste management and environmental protection', true),
('Public Safety Department', 'PSD', 'safety', 'Manages public safety and emergency services', true),
('Urban Planning Department', 'UPD', 'administration', 'City planning and development oversight', true)
ON CONFLICT (code) DO NOTHING;

-- Create functions for workflow automation

-- Function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION create_profile_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (
    id,
    email,
    user_type,
    full_name,
    first_name,
    last_name,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'user'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    now(),
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS create_profile_trigger ON auth.users;
CREATE TRIGGER create_profile_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_profile_for_new_user();

-- Function to update tender status when bid is accepted
CREATE OR REPLACE FUNCTION handle_bid_acceptance()
RETURNS TRIGGER AS $$
BEGIN
  -- If bid is accepted, update tender
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    UPDATE tenders 
    SET 
      status = 'awarded',
      workflow_stage = 'awarded',
      awarded_contractor_id = NEW.user_id,
      awarded_amount = NEW.amount,
      awarded_at = now(),
      updated_at = now()
    WHERE id = NEW.tender_id;

    -- Update related issue if exists
    UPDATE issues 
    SET 
      workflow_stage = 'contractor_assigned',
      status = 'in_progress',
      current_assignee_id = NEW.user_id,
      updated_at = now()
    WHERE id = (
      SELECT source_issue_id FROM tenders WHERE id = NEW.tender_id
    );

    -- Reject all other bids for this tender
    UPDATE bids 
    SET 
      status = 'rejected',
      updated_at = now()
    WHERE tender_id = NEW.tender_id AND id != NEW.id AND status = 'submitted';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for bid acceptance
DROP TRIGGER IF EXISTS bid_acceptance_trigger ON bids;
CREATE TRIGGER bid_acceptance_trigger
  AFTER UPDATE ON bids
  FOR EACH ROW EXECUTE FUNCTION handle_bid_acceptance();

-- Function to handle work completion verification
CREATE OR REPLACE FUNCTION handle_work_verification()
RETURNS TRIGGER AS $$
BEGIN
  -- If work completion is approved
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.progress_type = 'completion' THEN
    -- Update tender status
    UPDATE tenders 
    SET 
      status = 'completed',
      workflow_stage = 'completed',
      completion_date = now(),
      verification_notes = NEW.verification_notes,
      updated_at = now()
    WHERE id = NEW.tender_id;

    -- Update related issue to resolved
    UPDATE issues 
    SET 
      status = 'resolved',
      workflow_stage = 'resolved',
      resolved_at = now(),
      final_resolution_notes = NEW.verification_notes,
      updated_at = now()
    WHERE id = (
      SELECT source_issue_id FROM tenders WHERE id = NEW.tender_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for work verification
DROP TRIGGER IF EXISTS work_verification_trigger ON work_progress;
CREATE TRIGGER work_verification_trigger
  AFTER UPDATE ON work_progress
  FOR EACH ROW EXECUTE FUNCTION handle_work_verification();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_issues_updated_at BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_issue_assignments_updated_at BEFORE UPDATE ON issue_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenders_updated_at BEFORE UPDATE ON tenders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bids_updated_at BEFORE UPDATE ON bids FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_work_progress_updated_at BEFORE UPDATE ON work_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_community_posts_updated_at BEFORE UPDATE ON community_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_feedback_updated_at BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_municipal_officials_updated_at BEFORE UPDATE ON municipal_officials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample municipal officials
INSERT INTO municipal_officials (name, title, department, email, phone, whatsapp_number, office_address, office_hours, responsibilities, bio, is_active) VALUES
('John Smith', 'City Manager', 'Administration', 'john.smith@city.gov', '+1-555-0101', '+15550101', '123 City Hall, Main St', 'Mon-Fri 9AM-5PM', ARRAY['City operations', 'Budget management'], 'Experienced city manager with 15+ years in municipal governance', true),
('Sarah Johnson', 'Public Works Director', 'Public Works', 'sarah.johnson@city.gov', '+1-555-0102', '+15550102', '456 Works Dept, Industrial Ave', 'Mon-Fri 8AM-4PM', ARRAY['Road maintenance', 'Infrastructure'], 'Civil engineer specializing in municipal infrastructure', true),
('Mike Chen', 'Parks Director', 'Parks & Recreation', 'mike.chen@city.gov', '+1-555-0103', '+15550103', '789 Parks Office, Green St', 'Mon-Fri 9AM-5PM', ARRAY['Park maintenance', 'Recreation programs'], 'Recreation specialist focused on community wellness', true)
ON CONFLICT DO NOTHING;