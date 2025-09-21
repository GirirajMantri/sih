import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Enhanced authentication functions with proper role handling
// Authentication functions
export const signUp = async (
  email,
  password,
  userType = 'user',
  profileData = {},
  locationData = {}
) => {
  try {
    console.log('Starting signup process for:', email, 'with frontend type:', userType);

    // Validate user type (must match database CHECK constraint)
    const validUserTypes = ['user', 'area_super_admin', 'department_admin', 'tender', 'admin'];
    if (!validUserTypes.includes(userType)) {
      throw new Error(`Invalid user type: ${userType}`);
    }

    // Validate UUID helper
    const isValidUUID = (id) =>
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

    const assignedAreaId = isValidUUID(locationData.areaId) ? locationData.areaId : null;
    const assignedDeptId = isValidUUID(locationData.departmentId) ? locationData.departmentId : null;

    console.log('Assigned area ID:', assignedAreaId);
    console.log('Assigned department ID:', assignedDeptId);

    // Create the auth user with metadata
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          user_type: userType,
          full_name: profileData.fullName || '',
          first_name: profileData.fullName?.split(' ')[0] || '',
          last_name: profileData.fullName?.split(' ').slice(1).join(' ') || '',
        },
      },
    });

    if (authError) {
      console.error('Auth signup error:', authError);
      return { data: null, error: authError };
    }

    if (!authData.user) {
      console.error('No user returned from signup');
      return { data: null, error: { message: 'No user returned from signup' } };
    }

    console.log('Auth user created successfully:', authData.user.id);

    // Retry fetching profile created by trigger
    let fetchedProfile = null;
    let retries = 3;

    while (retries > 0 && !fetchedProfile) {
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle(); // safer than .single()

      if (existingProfile) {
        fetchedProfile = existingProfile;
        break;
      }

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching profile:', fetchError);
      }

      retries--;
      if (retries > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // If profile doesn't exist, create it manually
    if (!fetchedProfile) {
      console.log('Creating profile manually...');

      const profileRecord = {
        id: authData.user.id, // UUID from Supabase auth
        email: email.trim().toLowerCase(),
        user_type: userType,
        full_name: profileData.fullName || '',
        first_name: profileData.fullName?.split(' ')[0] || '',
        last_name: profileData.fullName?.split(' ').slice(1).join(' ') || '',
        phone: profileData.phone || '',
        address: profileData.address || '',
        city: profileData.city || '',
        state: profileData.state || '',
        postal_code: profileData.postalCode || '',
        points: 0,
        notification_settings: { email: true, push: true, sms: false },
        preferences: {},
        assigned_area_id: assignedAreaId,
        assigned_department_id: assignedDeptId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };


      console.log('Profile record being inserted:', profileRecord);

      const { data: createdProfile, error: profileError } = await supabase
        .from('profiles')
        .insert([profileRecord])
        .select()
        .maybeSingle();

      if (profileError) {
        console.error('Manual profile creation error:', profileError);
        return { data: null, error: profileError };
      }

      fetchedProfile = createdProfile;
    }

    console.log('Profile setup completed:', fetchedProfile);

    return {
      data: {
        user: authData.user,
        profile: fetchedProfile,
      },
      error: null,
    };
  } catch (error) {
    console.error('Signup error:', error);
    return { data: null, error };
  }
};

// Enhanced signIn with proper role-based routing



// Enhanced signIn function with proper routing logic
export const signIn = async (email, password) => {
  try {
    console.log('Starting signin process for:', email);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), // Normalize email
      password,
    });

    if (authError) {
      console.error('Auth signin error:', authError);
      return { data: null, error: authError };
    }

    if (!authData.user) {
      console.error('No user returned from signin');
      return { data: null, error: { message: 'No user returned from signin' } };
    }

    console.log('Auth signin successful:', authData.user.id);

    // Get the user profile with retries
    let profileData = null;
    let retries = 3;

    while (retries > 0 && !profileData) {
      const { data: profile, error: profileError } = await getUserProfile(authData.user.id);

      if (profile) {
        profileData = profile;
        break;
      }

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Profile fetch error:', profileError);
      }

      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // If no profile found, try direct query
    if (!profileData) {
      const { data: directProfile, error: directError } = await supabase
        .from('profiles')
        .select(`
          *,
          assigned_area:assigned_area_id (
            id,
            name,
            code
          ),
          assigned_department:assigned_department_id (
            id,
            name,
            code,
            category
          )
        `)
        .eq('id', authData.user.id)
        .single();

      if (!directError && directProfile) {
        profileData = directProfile;
      }
    }

    // Update last login if profile exists
    if (profileData) {
      supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', authData.user.id)
        .then(({ error }) => {
          if (error) console.error('Failed to update last login:', error);
        });
    } else {
      console.warn('Profile not found for user:', authData.user.id);
      return { 
        data: null, 
        error: { message: 'Profile not found. Please contact support.' } 
      };
    }

    console.log('Profile loaded successfully:', profileData.user_type);

    return {
      data: {
        user: authData.user,
        profile: profileData
      },
      error: null
    };

  } catch (error) {
    console.error('Signin error:', error);
    return { data: null, error };
  }
};

export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Signout error:', error);
    return { error };
  }
};

export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return { user, error: null };
  } catch (error) {
    console.error('Get current user error:', error);
    return { user: null, error };
  }
};

export const getUserProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        *,
        assigned_area:assigned_area_id (
          id,
          name,
          code
        ),
        assigned_department:assigned_department_id (
          id,
          name,
          code,
          category
        )
      `)
      .eq('id', userId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get user profile error:', error);
    return { data: null, error };
  }
};

// Enhanced admin dashboard functions
export const getAdminDashboardStats = async () => {
  try {
    const [issuesResult, usersResult, tendersResult] = await Promise.all([
      supabase.from('issues').select('id, status, workflow_stage, created_at'),
      supabase.from('profiles').select('id, user_type, created_at, last_login_at'),
      supabase.from('tenders').select('id, status, workflow_stage')
    ]);

    const issues = issuesResult.data || [];
    const users = usersResult.data || [];
    const tenders = tendersResult.data || [];

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stats = {
      total_issues: issues.length,
      pending_issues: issues.filter(i => i.status === 'pending').length,
      in_progress_issues: issues.filter(i => i.status === 'in_progress').length,
      resolved_issues: issues.filter(i => i.status === 'resolved').length,
      recent_issues: issues.filter(i => new Date(i.created_at) > weekAgo).length,
      total_users: users.length,
      active_users: users.filter(u => u.last_login_at && new Date(u.last_login_at) > weekAgo).length,
      active_tenders: tenders.filter(t => t.status === 'available').length,
      resolution_rate: issues.length > 0 ? Math.round((issues.filter(i => i.status === 'resolved').length / issues.length) * 100) : 0,
      response_time: '3.2 days'
    };

    return { data: stats, error: null };
  } catch (error) {
    console.error('Get admin dashboard stats error:', error);
    return { data: null, error };
  }
};

// Enhanced area super admin functions
export const getAreaSuperAdminDashboard = async () => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data: profile } = await getUserProfile(user.id);
    if (!profile || profile.user_type !== 'area_super_admin') {
      throw new Error('Access denied');
    }

    // Get issues for the assigned area
    const { data: issues, error: issuesError } = await supabase
      .from('issues')
      .select(`
        *,
        profiles:user_id (
          full_name,
          first_name,
          email,
          user_type
        ),
        current_assignee:current_assignee_id (
          full_name,
          user_type
        ),
        assignments:issue_assignments (
          id,
          assignment_type,
          assignment_notes,
          status,
          created_at,
          assigned_by_profile:assigned_by (
            full_name,
            user_type
          ),
          assigned_to_profile:assigned_to (
            full_name,
            user_type
          )
        )
      `)
      .eq('assigned_area_id', profile.assigned_area_id)
      .order('created_at', { ascending: false });

    if (issuesError) throw issuesError;

    // Get departments
    const { data: departments } = await getDepartments();

    return {
      data: {
        issues: issues || [],
        departments: departments || [],
        areaId: profile.assigned_area_id
      },
      error: null
    };
  } catch (error) {
    console.error('Get area super admin dashboard error:', error);
    return { data: null, error };
  }
};

// Enhanced department admin functions
export const getDepartmentAdminDashboard = async () => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data: profile } = await getUserProfile(user.id);
    if (!profile || profile.user_type !== 'department_admin') {
      throw new Error('Access denied');
    }

    // Get issues assigned to this department
    const { data: issues, error: issuesError } = await supabase
      .from('issues')
      .select(`
        *,
        profiles:user_id (
          full_name,
          first_name,
          email,
          user_type
        ),
        current_assignee:current_assignee_id (
          full_name,
          user_type
        )
      `)
      .eq('assigned_department_id', profile.assigned_department_id)
      .order('created_at', { ascending: false });

    if (issuesError) throw issuesError;

    // Get tenders created by this department
    const { data: tenders, error: tendersError } = await supabase
      .from('tenders')
      .select(`
        *,
        awarded_contractor:awarded_contractor_id (
          full_name,
          user_type
        ),
        bids:bids (
          id,
          amount,
          user_id,
          status,
          contractor:user_id (
            full_name,
            user_type
          )
        ),
        work_progress:work_progress (
          id,
          progress_type,
          progress_percentage,
          status,
          created_at
        )
      `)
      .eq('department_id', profile.assigned_department_id)
      .order('created_at', { ascending: false });

    if (tendersError) throw tendersError;

    // Get contractors who have worked with this department
    const { data: contractors, error: contractorsError } = await supabase
      .from('profiles')
      .select(`
        *,
        contractor_bids:bids (
          id,
          amount,
          status,
          tender:tender_id (
            id,
            title,
            status,
            department_id
          )
        )
      `)
      .eq('user_type', 'tender')
      .eq('is_verified', true);

    if (contractorsError) throw contractorsError;

    return {
      data: {
        issues: issues || [],
        tenders: tenders || [],
        contractors: contractors || [],
        departmentId: profile.assigned_department_id
      },
      error: null
    };
  } catch (error) {
    console.error('Get department admin dashboard error:', error);
    return { data: null, error };
  }
};

// Enhanced assignment functions
export const assignIssueToDepartment = async (issueId, departmentId, notes = '') => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Create assignment record
    const { error: assignmentError } = await supabase
      .from('issue_assignments')
      .insert([{
        issue_id: issueId,
        assigned_by: user.id,
        assigned_department_id: departmentId,
        assignment_type: 'area_to_department',
        assignment_notes: notes,
        status: 'active'
      }]);

    if (assignmentError) throw assignmentError;

    // Update the issue
    const { error: updateError } = await supabase
      .from('issues')
      .update({
        assigned_department_id: departmentId,
        workflow_stage: 'department_assigned',
        status: 'acknowledged',
        updated_at: new Date().toISOString()
      })
      .eq('id', issueId);

    if (updateError) throw updateError;

    return { error: null };
  } catch (error) {
    console.error('Assign issue to department error:', error);
    return { error };
  }
};

// Alias for backward compatibility
export const assignIssueToDepart = assignIssueToDepartment;

// Enhanced tender functions
export const createTender = async (tenderData) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('tenders')
      .insert([{
        ...tenderData,
        posted_by: user.id,
        workflow_stage: 'created',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Update tender status to available
    const { error: statusError } = await supabase
      .from('tenders')
      .update({
        status: 'available',
        workflow_stage: 'available'
      })
      .eq('id', data.id);

    if (statusError) throw statusError;

    return { data, error: null };
  } catch (error) {
    console.error('Create tender error:', error);
    return { data: null, error };
  }
};

export const getTendersByDepartment = async (departmentId) => {
  try {
    const { data, error } = await supabase
      .from('tenders')
      .select(`
        *,
        posted_by_profile:posted_by (
          full_name,
          user_type
        ),
        department:department_id (
          name,
          code,
          category
        ),
        source_issue:source_issue_id (
          title,
          category,
          location_name
        ),
        awarded_contractor:awarded_contractor_id (
          full_name,
          user_type,
          phone,
          email
        ),
        bids:bids (
          id,
          amount,
          user_id,
          status,
          submitted_at,
          contractor:user_id (
            full_name,
            user_type,
            phone,
            email
          )
        ),
        work_progress:work_progress (
          id,
          progress_type,
          progress_percentage,
          status,
          created_at
        )
      `)
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get tenders by department error:', error);
    return { data: null, error };
  }
};

export const getBidsByTender = async (tenderId) => {
  try {
    const { data, error } = await supabase
      .from('bids')
      .select(`
        *,
        contractor:user_id (
          full_name,
          first_name,
          user_type,
          phone,
          email,
          contractor_rating,
          contractor_specializations
        )
      `)
      .eq('tender_id', tenderId)
      .order('amount', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get bids by tender error:', error);
    return { data: null, error };
  }
};

export const acceptBid = async (bidId, tenderId) => {
  try {
    // Update the accepted bid
    const { data: acceptedBid, error: acceptError } = await supabase
      .from('bids')
      .update({
        status: 'accepted',
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', bidId)
      .select('user_id, amount')
      .single();

    if (acceptError) throw acceptError;

    // The trigger will handle tender and issue updates automatically
    return { error: null };
  } catch (error) {
    console.error('Accept bid error:', error);
    return { error };
  }
};

export const rejectBid = async (bidId) => {
  try {
    const { error } = await supabase
      .from('bids')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', bidId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Reject bid error:', error);
    return { error };
  }
};

// Enhanced contractor functions
export const getContractorTenders = async () => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('tenders')
      .select(`
        *,
        department:department_id (
          name,
          category
        ),
        source_issue:source_issue_id (
          title,
          category,
          location_name
        ),
        my_bid:bids!inner (
          id,
          amount,
          status,
          submitted_at
        ),
        work_progress:work_progress (
          id,
          progress_type,
          progress_percentage,
          status,
          created_at
        )
      `)
      .eq('bids.user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get contractor tenders error:', error);
    return { data: null, error };
  }
};

export const startWork = async (tenderId) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('tenders')
      .update({
        workflow_stage: 'work_in_progress',
        work_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', tenderId)
      .eq('awarded_contractor_id', user.id)
      .select()
      .single();

    if (error) throw error;

    // Update related issue
    const { error: issueError } = await supabase
      .from('issues')
      .update({
        workflow_stage: 'work_in_progress',
        status: 'in_progress'
      })
      .eq('id', data.source_issue_id);

    if (issueError) console.error('Error updating issue:', issueError);

    return { data, error: null };
  } catch (error) {
    console.error('Start work error:', error);
    return { data: null, error };
  }
};

// Work progress functions
export const createWorkProgress = async (progressData) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('work_progress')
      .insert([{
        ...progressData,
        contractor_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // If this is a completion submission, update tender workflow
    if (progressData.progress_type === 'completion') {
      await supabase
        .from('tenders')
        .update({
          workflow_stage: 'work_completed'
        })
        .eq('id', progressData.tender_id);
    }

    return { data, error: null };
  } catch (error) {
    console.error('Create work progress error:', error);
    return { data: null, error };
  }
};

export const getWorkProgressByTender = async (tenderId) => {
  try {
    const { data, error } = await supabase
      .from('work_progress')
      .select(`
        *,
        contractor:contractor_id (
          full_name,
          user_type,
          phone,
          email
        ),
        verified_by_profile:verified_by (
          full_name,
          user_type
        )
      `)
      .eq('tender_id', tenderId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get work progress error:', error);
    return { data: null, error };
  }
};

export const verifyWorkProgress = async (progressId, verificationNotes = '', approved = true) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('work_progress')
      .update({
        status: approved ? 'approved' : 'rejected',
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        verification_notes: verificationNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', progressId)
      .select('tender_id, progress_type')
      .single();

    if (error) throw error;

    // The trigger will handle tender and issue status updates automatically
    return { data, error: null };
  } catch (error) {
    console.error('Verify work progress error:', error);
    return { data: null, error };
  }
};

// Enhanced workflow stage functions
export const getIssuesByWorkflowStage = async (stage, areaId = null, departmentId = null) => {
  try {
    let query = supabase
      .from('issues')
      .select(`
        *,
        profiles:user_id (
          full_name,
          first_name,
          email,
          user_type
        ),
        current_assignee:current_assignee_id (
          full_name,
          user_type
        ),
        assigned_area:assigned_area_id (
          name,
          code
        ),
        assigned_department:assigned_department_id (
          name,
          code,
          category
        ),
        assignments:issue_assignments (
          id,
          assignment_type,
          assignment_notes,
          status,
          created_at,
          assigned_by_profile:assigned_by (
            full_name,
            user_type
          )
        ),
        tender:tenders!source_issue_id (
          id,
          title,
          status,
          workflow_stage,
          bids:bids (
            id,
            amount,
            status
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (stage !== 'all') {
      query = query.eq('workflow_stage', stage);
    }
    if (areaId) {
      query = query.eq('assigned_area_id', areaId);
    }
    if (departmentId) {
      query = query.eq('assigned_department_id', departmentId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get issues by workflow stage error:', error);
    return { data: null, error };
  }
};

// Location and organizational functions
export const getAreas = async () => {
  try {
    const { data, error } = await supabase
      .from('areas')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get areas error:', error);
    return { data: null, error };
  }
};

export const getDepartments = async () => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get departments error:', error);
    return { data: null, error };
  }
};

// Real-time subscriptions for live updates
export const subscribeToIssueUpdates = (callback) => {
  return supabase
    .channel('issue_updates')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'issues' },
      callback
    )
    .subscribe();
};

export const subscribeToTenderUpdates = (callback) => {
  return supabase
    .channel('tender_updates')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'tenders' },
      callback
    )
    .subscribe();
};

export const subscribeToAssignmentUpdates = (callback) => {
  return supabase
    .channel('assignment_updates')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'issue_assignments' },
      callback
    )
    .subscribe();
};

export const subscribeToBidUpdates = (callback) => {
  return supabase
    .channel('bid_updates')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'bids' },
      callback
    )
    .subscribe();
};

export const updateUserProfile = async (userId, updates) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Update user profile error:', error);
    return { data: null, error };
  }
};

export const updateNotificationSettings = async (userId, settings) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        notification_settings: settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Update notification settings error:', error);
    return { data: null, error };
  }
};

export const resetPassword = async (email) => {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'exp://localhost:8081/reset-password',
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Reset password error:', error);
    return { data: null, error };
  }
};

export const updatePassword = async (newPassword) => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Update password error:', error);
    return { data: null, error };
  }
};

export const sendVerificationEmail = async (email) => {
  try {
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Send verification email error:', error);
    return { data: null, error };
  }
};

// Issues functions
export const createIssue = async (issueData) => {
  try {
    const { data, error } = await supabase
      .from('issues')
      .insert([{
        ...issueData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Create issue error:', error);
    return { data: null, error };
  }
};

export const getIssues = async (filters = {}) => {
  try {
    let query = supabase
      .from('issues')
      .select(`
        *,
        profiles:user_id (
          full_name,
          first_name,
          user_type,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (filters.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.location) {
      query = query.ilike('location_name', `%${filters.location}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get issues error:', error);
    return { data: null, error };
  }
};

export const getUserIssues = async () => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get user issues error:', error);
    return { data: null, error };
  }
};

export const getIssueById = async (issueId) => {
  try {
    const { data, error } = await supabase
      .from('issues')
      .select(`
        *,
        profiles:user_id (
          full_name,
          first_name,
          email,
          user_type
        ),
        assignments:issue_assignments (
          id,
          assignment_type,
          assignment_notes,
          status,
          created_at,
          assigned_by_profile:assigned_by (
            full_name,
            user_type
          ),
          assigned_to_profile:assigned_to (
            full_name,
            user_type
          )
        )
      `)
      .eq('id', issueId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get issue by ID error:', error);
    return { data: null, error };
  }
};

export const updateIssue = async (issueId, updates) => {
  try {
    const { data, error } = await supabase
      .from('issues')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', issueId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Update issue error:', error);
    return { data: null, error };
  }
};

export const updateUserPoints = async (userId, action, points) => {
  try {
    // Get current points
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('points')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    const newPoints = (profile.points || 0) + points;

    const { data, error } = await supabase
      .from('profiles')
      .update({
        points: newPoints,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Update user points error:', error);
    return { data: null, error };
  }
};

// Community functions
export const getCommunityFeed = async (filters = {}) => {
  try {
    // Get issues
    let issuesQuery = supabase
      .from('issues')
      .select(`
        *,
        profiles:user_id (
          full_name,
          first_name,
          user_type,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (filters.category && filters.category !== 'all') {
      issuesQuery = issuesQuery.eq('category', filters.category);
    }
    if (filters.status && filters.status !== 'all') {
      issuesQuery = issuesQuery.eq('status', filters.status);
    }
    if (filters.location) {
      issuesQuery = issuesQuery.ilike('location_name', `%${filters.location}%`);
    }

    // Get community posts
    let postsQuery = supabase
      .from('community_posts')
      .select(`
        *,
        profiles:user_id (
          full_name,
          first_name,
          user_type,
          email
        )
      `)
      .order('created_at', { ascending: false });

    const [issuesResult, postsResult] = await Promise.all([
      issuesQuery,
      postsQuery
    ]);

    if (issuesResult.error) throw issuesResult.error;
    if (postsResult.error) throw postsResult.error;

    // Combine and format data
    const issues = (issuesResult.data || []).map(issue => ({
      ...issue,
      type: 'issue'
    }));

    const posts = (postsResult.data || []).map(post => ({
      ...post,
      type: 'post'
    }));

    const combinedData = [...issues, ...posts].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );

    return { data: combinedData, error: null };
  } catch (error) {
    console.error('Get community feed error:', error);
    return { data: null, error };
  }
};

export const getPosts = async () => {
  try {
    const { data, error } = await supabase
      .from('community_posts')
      .select(`
        *,
        profiles:user_id (
          full_name,
          first_name,
          user_type,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get posts error:', error);
    return { data: null, error };
  }
};

// Voting functions
export const voteOnIssue = async (issueId, voteType) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Check if user already voted
    const { data: existingVote } = await supabase
      .from('issue_votes')
      .select('*')
      .eq('issue_id', issueId)
      .eq('user_id', user.id)
      .single();

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        // Remove vote if same type
        const { error } = await supabase
          .from('issue_votes')
          .delete()
          .eq('id', existingVote.id);
        if (error) throw error;
      } else {
        // Update vote type
        const { error } = await supabase
          .from('issue_votes')
          .update({ vote_type: voteType })
          .eq('id', existingVote.id);
        if (error) throw error;
      }
    } else {
      // Create new vote
      const { error } = await supabase
        .from('issue_votes')
        .insert([{
          issue_id: issueId,
          user_id: user.id,
          vote_type: voteType
        }]);
      if (error) throw error;
    }

    return { error: null };
  } catch (error) {
    console.error('Vote on issue error:', error);
    return { error };
  }
};

export const getUserVote = async (issueId) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) return { data: null, error: null };

    const { data, error } = await supabase
      .from('issue_votes')
      .select('vote_type')
      .eq('issue_id', issueId)
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get user vote error:', error);
    return { data: null, error };
  }
};

// Tender functions
export const getTenders = async (status = 'all') => {
  try {
    let query = supabase
      .from('tenders')
      .select(`
        *,
        posted_by_profile:posted_by (
          full_name,
          user_type
        ),
        bids:bids (
          id,
          amount,
          user_id,
          status
        )
      `)
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get tenders error:', error);
    return { data: null, error };
  }
};

export const getTendersByDepartment = async (departmentId) => {
  try {
    const { data, error } = await supabase
      .from('tenders')
      .select(`
        *,
        posted_by_profile:posted_by (
          full_name,
          user_type
        ),
        bids:bids (
          id,
          amount,
          user_id,
          status,
          contractor:user_id (
            full_name,
            user_type
          )
        ),
        source_issue:source_issue_id (
          title,
          category
        )
      `)
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get tenders by department error:', error);
    return { data: null, error };
  }
};

export const getBidsByTender = async (tenderId) => {
  try {
    const { data, error } = await supabase
      .from('bids')
      .select(`
        *,
        contractor:user_id (
          full_name,
          first_name,
          user_type,
          phone,
          email
        )
      `)
      .eq('tender_id', tenderId)
      .order('amount', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get bids by tender error:', error);
    return { data: null, error };
  }
};

export const acceptBid = async (bidId, tenderId) => {
  try {
    const { data: acceptedBid, error: acceptError } = await supabase
      .from('bids')
      .update({
        status: 'accepted',
        updated_at: new Date().toISOString()
      })
      .eq('id', bidId)
      .select('user_id, amount')
      .single();

    if (acceptError) throw acceptError;

    // Reject all other bids for this tender
    const { error: rejectError } = await supabase
      .from('bids')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString()
      })
      .eq('tender_id', tenderId)
      .neq('id', bidId);

    if (rejectError) throw rejectError;

    // The trigger will handle tender and issue updates automatically

    return { error: null };
  } catch (error) {
    console.error('Accept bid error:', error);
    return { error };
  }
};

export const rejectBid = async (bidId) => {
  try {
    const { error } = await supabase
      .from('bids')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString()
      })
      .eq('id', bidId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Reject bid error:', error);
    return { error };
  }
};
export const createTender = async (tenderData) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('tenders')
      .insert([{
        ...tenderData,
        posted_by: user.id,
        workflow_stage: 'created',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Create tender error:', error);
    return { data: null, error };
  }
};

export const getUserBids = async () => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('bids')
      .select(`
        *,
        tender:tender_id (
          title,
          status,
          deadline_date
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get user bids error:', error);
    return { data: null, error };
  }
};

export const createBid = async (bidData) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('bids')
      .insert([{
        ...bidData,
        user_id: user.id,
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Create bid error:', error);
    return { data: null, error };
  }
};

// Work progress functions
export const createWorkProgress = async (progressData) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('work_progress')
      .insert([{
        ...progressData,
        contractor_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Create work progress error:', error);
    return { data: null, error };
  }
};

export const getWorkProgressByTender = async (tenderId) => {
  try {
    const { data, error } = await supabase
      .from('work_progress')
      .select(`
        *,
        contractor:contractor_id (
          full_name,
          user_type,
          phone,
          email
        ),
        verified_by_profile:verified_by (
          full_name,
          user_type
        )
      `)
      .eq('tender_id', tenderId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get work progress error:', error);
    return { data: null, error };
  }
};

export const verifyWorkProgress = async (progressId, verificationNotes = '', approved = true) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('work_progress')
      .update({
        status: approved ? 'approved' : 'rejected',
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        verification_notes: verificationNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', progressId)
      .select('tender_id') // Add this to get tender_id
      .single();

    if (error) throw error;

    // If this is a completion verification, update tender status
    if (approved && data.progress_type === 'completion') {
      // First get the tender to find source_issue_id
      const { data: tender, error: tenderError } = await supabase
        .from('tenders')
        .select('source_issue_id')
        .eq('id', data.tender_id)
        .single();

      if (!tenderError && tender?.source_issue_id) {
        // Update tender status
        await supabase
          .from('tenders')
          .update({
            status: 'completed',
            workflow_stage: 'verified',
            updated_at: new Date().toISOString()
          })
          .eq('id', data.tender_id);

        // Update related issue to resolved
        await supabase
          .from('issues')
          .update({
            status: 'resolved',
            workflow_stage: 'resolved',
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', tender.source_issue_id);
      }
    }

    return { data, error: null };
  } catch (error) {
    console.error('Verify work progress error:', error);
    return { data: null, error };
  }
};

export const uploadTenderDocument = async (tenderId, documentData) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('tender_documents')
      .insert([{
        ...documentData,
        tender_id: tenderId,
        uploaded_by: user.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Upload tender document error:', error);
    return { data: null, error };
  }
};

export const getTenderDocuments = async (tenderId) => {
  try {
    const { data, error } = await supabase
      .from('tender_documents')
      .select(`
        *,
        uploaded_by_profile:uploaded_by (
          full_name,
          user_type
        )
      `)
      .eq('tender_id', tenderId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get tender documents error:', error);
    return { data: null, error };
  }
};

// Enhanced tender functions with workflow
export const startWork = async (tenderId) => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('tenders')
      .update({
        workflow_stage: 'work_in_progress',
        work_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', tenderId)
      .eq('awarded_contractor_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Start work error:', error);
    return { data: null, error };
  }
};

export const getContractorTenders = async () => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('tenders')
      .select(`
        *,
        department:department_id (
          name,
          category
        ),
        source_issue:source_issue_id (
          title,
          category,
          location_name
        ),
        my_bid:bids!inner (
          id,
          amount,
          status,
          submitted_at
        ),
        work_progress:work_progress (
          id,
          progress_type,
          progress_percentage,
          status,
          created_at
        )
      `)
      .eq('bids.user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get contractor tenders error:', error);
    return { data: null, error };
  }
};

// Feedback functions
export const createFeedback = async (feedbackData) => {
  try {
    const { data, error } = await supabase
      .from('feedback')
      .insert([{
        ...feedbackData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Create feedback error:', error);
    return { data: null, error };
  }
};

export const getUserFeedback = async () => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get user feedback error:', error);
    return { data: null, error };
  }
};

// Municipal officials functions
export const getMunicipalOfficials = async () => {
  try {
    const { data, error } = await supabase
      .from('municipal_officials')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get municipal officials error:', error);
    return { data: null, error };
  }
};

// Leaderboard functions
export const getLeaderboard = async (period = 'month') => {
  try {
    // Calculate date range based on period
    const now = new Date();
    let dateFrom = null;

    switch (period) {
      case 'week':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'month':
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'quarter':
        dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'year':
        dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
        break;
    }

    let query = supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        first_name,
        user_type,
        points,
        avatar_url,
        created_at,
        issues_reported:issues!user_id(count),
        posts_created:community_posts!user_id(count)
      `)
      .gt('points', 0);

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    const { data, error } = await query.order('points', { ascending: false });

    if (error) throw error;

    // Transform the data to include calculated scores
    const leaderboardData = (data || []).map(user => ({
      ...user,
      total_score: user.points || 0,
      issues_reported: user.issues_reported?.[0]?.count || 0,
      posts_created: user.posts_created?.[0]?.count || 0,
      badges: [] // Can be enhanced later
    }));

    return { data: leaderboardData, error: null };
  } catch (error) {
    console.error('Get leaderboard error:', error);
    return { data: null, error };
  }
};

// Location functions
export const getStates = async () => {
  try {
    // For now, return static data. In production, this would come from a states table
    const states = [
      { id: '1', name: 'Maharashtra', code: 'MH' },
      { id: '2', name: 'Karnataka', code: 'KA' },
      { id: '3', name: 'Tamil Nadu', code: 'TN' },
      { id: '4', name: 'Gujarat', code: 'GJ' },
      { id: '5', name: 'Rajasthan', code: 'RJ' },
      { id: '6', name: 'Uttar Pradesh', code: 'UP' },
      { id: '7', name: 'West Bengal', code: 'WB' },
      { id: '8', name: 'Madhya Pradesh', code: 'MP' },
    ];

    return { data: states, error: null };
  } catch (error) {
    console.error('Get states error:', error);
    return { data: null, error };
  }
};

export const getDistrictsByState = async (stateId) => {
  try {
    // Static data for demo. In production, this would be a proper districts table
    const districtsByState = {
      '1': [ // Maharashtra
        { id: '1-1', name: 'Mumbai', code: 'MUM', state_id: '1' },
        { id: '1-2', name: 'Pune', code: 'PUN', state_id: '1' },
        { id: '1-3', name: 'Nagpur', code: 'NAG', state_id: '1' },
        { id: '1-4', name: 'Nashik', code: 'NAS', state_id: '1' },
      ],
      '2': [ // Karnataka
        { id: '2-1', name: 'Bangalore', code: 'BLR', state_id: '2' },
        { id: '2-2', name: 'Mysore', code: 'MYS', state_id: '2' },
        { id: '2-3', name: 'Hubli', code: 'HUB', state_id: '2' },
      ],
      '3': [ // Tamil Nadu
        { id: '3-1', name: 'Chennai', code: 'CHE', state_id: '3' },
        { id: '3-2', name: 'Coimbatore', code: 'COI', state_id: '3' },
        { id: '3-3', name: 'Madurai', code: 'MAD', state_id: '3' },
      ]
    };

    return { data: districtsByState[stateId] || [], error: null };
  } catch (error) {
    console.error('Get districts error:', error);
    return { data: null, error };
  }
};

export const getAreasByDistrict = async (districtId) => {
  try {
    const { data, error } = await supabase
      .from('areas')
      .select('*')
      .eq('district_id', districtId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get areas error:', error);
    return { data: null, error };
  }
};

// Enhanced location functions with proper data
export const getIssuesWithLocation = async (filters = {}) => {
  try {
    let query = supabase
      .from('issues')
      .select(`
        *,
        profiles:user_id (
          full_name,
          first_name,
          user_type
        ),
        assigned_area:assigned_area_id (
          name,
          code
        )
      `)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('created_at', { ascending: false });

    if (filters.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }
    if (filters.area && filters.area !== 'all') {
      query = query.eq('assigned_area_id', filters.area);
    }
    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get issues with location error:', error);
    return { data: null, error };
  }
};

// Notification functions
export const getUserNotifications = async () => {
  try {
    const { user } = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Get user notifications error:', error);
    return { data: null, error };
  }
};

// Avatar upload function
export const uploadAvatar = async (imageUri, userId) => {
  try {
    const fileExt = imageUri.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    // For now, return a placeholder URL since we're using Cloudinary for images
    // In production, you would upload to Supabase storage
    const avatarUrl = `https://ui-avatars.com/api/?name=${userId}&background=1E40AF&color=fff&size=200`;

    const { error } = await supabase
      .from('profiles')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;
    return { data: { avatarUrl }, error: null };
  } catch (error) {
    console.error('Upload avatar error:', error);
    return { data: null, error };
  }
};

export default supabase;