import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Modal, TextInput } from 'react-native';
import { ArrowLeft, Filter, Search, FileText, DollarSign, Calendar, Users, Eye, Award, Activity, CircleCheck as CheckCircle, X, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { 
  getTendersByDepartment,
  getBidsByTender,
  acceptBid,
  rejectBid,
  getWorkProgressByTender,
  verifyWorkProgress,
  getCurrentUser,
  getUserProfile,
  createTender
} from '../../lib/supabase';

export default function DepartmentTenders() {
  const router = useRouter();
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [showWorkProgressModal, setShowWorkProgressModal] = useState(false);
  const [showCreateTenderModal, setShowCreateTenderModal] = useState(false);
  const [selectedTender, setSelectedTender] = useState(null);
  const [tenderBids, setTenderBids] = useState([]);
  const [workProgressList, setWorkProgressList] = useState([]);
  const [loadingBids, setLoadingBids] = useState(false);
  const [processingBid, setProcessingBid] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [userDepartmentId, setUserDepartmentId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [tenderData, setTenderData] = useState({
    title: '',
    description: '',
    category: 'infrastructure',
    location: '',
    estimatedBudgetMin: '',
    estimatedBudgetMax: '',
    deadlineDate: '',
    requirements: ''
  });

  const filters = [
    { id: 'all', label: 'All Tenders', count: 0 },
    { id: 'available', label: 'Available', count: 0 },
    { id: 'awarded', label: 'Awarded', count: 0 },
    { id: 'work_in_progress', label: 'Work in Progress', count: 0 },
    { id: 'work_completed', label: 'Pending Review', count: 0 },
    { id: 'completed', label: 'Completed', count: 0 },
  ];

  const categories = [
    { id: 'infrastructure', label: 'Infrastructure' },
    { id: 'utilities', label: 'Utilities' },
    { id: 'environment', label: 'Environment' },
    { id: 'safety', label: 'Safety' },
    { id: 'parks', label: 'Parks & Recreation' },
  ];

  useEffect(() => {
    loadData();
  }, [selectedFilter]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Get current user's department
      const { user } = await getCurrentUser();
      const { data: profile } = await getUserProfile(user.id);
      setUserDepartmentId(profile?.assigned_department_id);

      // Load tenders for this department
      const { data: tendersData, error } = await getTendersByDepartment(profile?.assigned_department_id);
      if (error) throw error;

      setTenders(tendersData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load tenders data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreateTender = () => {
    setTenderData({
      title: '',
      description: '',
      category: 'infrastructure',
      location: '',
      estimatedBudgetMin: '',
      estimatedBudgetMax: '',
      deadlineDate: '',
      requirements: ''
    });
    setShowCreateTenderModal(true);
  };

  const submitTender = async () => {
    if (!tenderData.title || !tenderData.description || !tenderData.deadlineDate || !tenderData.location) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setCreating(true);

      const tender = {
        title: tenderData.title,
        description: tenderData.description,
        category: tenderData.category,
        location: tenderData.location,
        estimated_budget_min: parseFloat(tenderData.estimatedBudgetMin) || 0,
        estimated_budget_max: parseFloat(tenderData.estimatedBudgetMax) || 0,
        deadline_date: tenderData.deadlineDate,
        submission_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 'medium',
        requirements: tenderData.requirements.split('\n').filter(r => r.trim()),
        status: 'available',
        department_id: userDepartmentId,
      };

      const { error } = await createTender(tender);
      if (error) throw error;

      Alert.alert(
        'Success',
        'Tender has been created successfully and is now available for contractors to bid',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowCreateTenderModal(false);
              loadData();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error creating tender:', error);
      Alert.alert('Error', 'Failed to create tender: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleViewBids = async (tender) => {
    try {
      setLoadingBids(true);
      setSelectedTender(tender);
      
      const { data: bids, error } = await getBidsByTender(tender.id);
      if (error) throw error;
      
      setTenderBids(bids || []);
      setShowBidsModal(true);
    } catch (error) {
      console.error('Error loading bids:', error);
      Alert.alert('Error', 'Failed to load bids');
    } finally {
      setLoadingBids(false);
    }
  };

  const handleViewWorkProgress = async (tender) => {
    try {
      setSelectedTender(tender);
      const { data, error } = await getWorkProgressByTender(tender.id);
      if (error) throw error;
      
      setWorkProgressList(data || []);
      setShowWorkProgressModal(true);
    } catch (error) {
      console.error('Error loading work progress:', error);
      Alert.alert('Error', 'Failed to load work progress');
    }
  };

  const handleAcceptBid = async (bidId, tenderId) => {
    Alert.alert(
      'Accept Bid',
      'Are you sure you want to accept this bid? This will reject all other bids and award the contract.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              setProcessingBid(true);
              const { error } = await acceptBid(bidId, tenderId);
              if (error) throw error;
              
              Alert.alert('Success', 'Bid accepted successfully. Contractor has been notified.');
              setShowBidsModal(false);
              await loadData();
            } catch (error) {
              console.error('Error accepting bid:', error);
              Alert.alert('Error', 'Failed to accept bid');
            } finally {
              setProcessingBid(false);
            }
          }
        }
      ]
    );
  };

  const handleRejectBid = async (bidId) => {
    Alert.alert(
      'Reject Bid',
      'Are you sure you want to reject this bid?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingBid(true);
              const { error } = await rejectBid(bidId);
              if (error) throw error;
              
              Alert.alert('Success', 'Bid rejected');
              // Reload bids
              const { data: updatedBids } = await getBidsByTender(selectedTender.id);
              setTenderBids(updatedBids || []);
            } catch (error) {
              console.error('Error rejecting bid:', error);
              Alert.alert('Error', 'Failed to reject bid');
            } finally {
              setProcessingBid(false);
            }
          }
        }
      ]
    );
  };

  const handleVerifyWork = async (progressId, approved) => {
    try {
      setVerifying(true);
      const { error } = await verifyWorkProgress(progressId, verificationNotes, approved);
      if (error) throw error;
      
      Alert.alert(
        'Success', 
        approved ? 'Work has been verified and tender marked as completed' : 'Work verification rejected'
      );
      setShowWorkProgressModal(false);
      setVerificationNotes('');
      await loadData();
    } catch (error) {
      console.error('Error verifying work:', error);
      Alert.alert('Error', 'Failed to verify work');
    } finally {
      setVerifying(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      available: '#1E40AF',
      awarded: '#F59E0B',
      work_in_progress: '#8B5CF6',
      work_completed: '#10B981',
      completed: '#6B7280',
      submitted: '#8B5CF6',
      accepted: '#10B981',
      rejected: '#EF4444',
      approved: '#10B981',
    };
    return colors[status] || '#6B7280';
  };

  const getCategoryColor = (category) => {
    const colors = {
      infrastructure: '#EF4444',
      utilities: '#F59E0B',
      environment: '#10B981',
      safety: '#8B5CF6',
      parks: '#06B6D4',
    };
    return colors[category] || '#6B7280';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Filter tenders
  const filteredTenders = selectedFilter === 'all' 
    ? tenders 
    : tenders.filter(tender => {
        if (selectedFilter === 'work_completed') {
          return tender.workflow_stage === 'work_completed';
        }
        return tender.status === selectedFilter || tender.workflow_stage === selectedFilter;
      });

  // Update filter counts
  const updatedFilters = filters.map(filter => ({
    ...filter,
    count: filter.id === 'all' 
      ? tenders.length 
      : tenders.filter(tender => {
          if (filter.id === 'work_completed') {
            return tender.workflow_stage === 'work_completed';
          }
          return tender.status === filter.id || tender.workflow_stage === filter.id;
        }).length
  }));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#1E40AF" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Department Tenders</Text>
          <Text style={styles.subtitle}>{tenders.length} total tenders</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={handleCreateTender}>
            <Plus size={20} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Search size={20} color="#1E40AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Filter size={20} color="#1E40AF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filtersList}>
            {updatedFilters.map((filter) => (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.filterChip,
                  selectedFilter === filter.id && styles.filterChipActive,
                ]}
                onPress={() => setSelectedFilter(filter.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedFilter === filter.id && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
                <View style={styles.filterChipBadge}>
                  <Text style={styles.filterChipBadgeText}>{filter.count}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Tenders List */}
      <ScrollView
        style={styles.tendersList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading tenders...</Text>
          </View>
        ) : filteredTenders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <FileText size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No tenders found</Text>
            <Text style={styles.emptyText}>
              {selectedFilter === 'all' 
                ? 'No tenders created yet. Create your first tender!'
                : `No tenders in ${filters.find(f => f.id === selectedFilter)?.label.toLowerCase()} status`}
            </Text>
            {selectedFilter === 'all' && (
              <TouchableOpacity style={styles.createFirstTenderButton} onPress={handleCreateTender}>
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.createFirstTenderText}>Create First Tender</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.tendersContainer}>
            {filteredTenders.map((tender) => (
              <View key={tender.id} style={styles.tenderCard}>
                {/* Tender Header */}
                <View style={styles.tenderHeader}>
                  <View style={styles.tenderMeta}>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(tender.workflow_stage || tender.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(tender.workflow_stage || tender.status) }]}>
                        {(tender.workflow_stage || tender.status).replace('_', ' ').charAt(0).toUpperCase() + (tender.workflow_stage || tender.status).replace('_', ' ').slice(1)}
                      </Text>
                    </View>
                    <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(tender.category) + '20' }]}>
                      <Text style={[styles.categoryText, { color: getCategoryColor(tender.category) }]}>
                        {tender.category}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.tenderDate}>{formatDate(tender.created_at)}</Text>
                </View>

                <Text style={styles.tenderTitle}>{tender.title}</Text>
                <Text style={styles.tenderDescription} numberOfLines={2}>
                  {tender.description}
                </Text>
                
                <View style={styles.tenderDetails}>
                  <View style={styles.tenderDetailRow}>
                    <DollarSign size={14} color="#10B981" />
                    <Text style={styles.tenderDetailText}>
                      Budget: {formatCurrency(tender.estimated_budget_min)} - {formatCurrency(tender.estimated_budget_max)}
                    </Text>
                  </View>
                  <View style={styles.tenderDetailRow}>
                    <Calendar size={14} color="#F59E0B" />
                    <Text style={styles.tenderDetailText}>
                      Deadline: {formatDate(tender.deadline_date)}
                    </Text>
                  </View>
                  <View style={styles.tenderDetailRow}>
                    <Users size={14} color="#8B5CF6" />
                    <Text style={styles.tenderDetailText}>
                      {tender.bids?.length || 0} bids received
                    </Text>
                  </View>
                </View>

                {/* Awarded Info */}
                {tender.awarded_contractor && (
                  <View style={styles.awardedInfo}>
                    <Award size={14} color="#10B981" />
                    <Text style={styles.awardedText}>
                      Awarded to {tender.awarded_contractor.full_name} • {formatCurrency(tender.awarded_amount)}
                    </Text>
                  </View>
                )}

                {/* Tender Actions */}
                <View style={styles.tenderActions}>
                  <TouchableOpacity
                    style={styles.viewBidsButton}
                    onPress={() => handleViewBids(tender)}
                  >
                    <Eye size={16} color="#1E40AF" />
                    <Text style={styles.viewBidsButtonText}>
                      View Bids ({tender.bids?.length || 0})
                    </Text>
                  </TouchableOpacity>

                  {/* View Work Progress Button */}
                  {(tender.workflow_stage === 'work_in_progress' || tender.workflow_stage === 'work_completed') && (
                    <TouchableOpacity
                      style={styles.workProgressButton}
                      onPress={() => handleViewWorkProgress(tender)}
                    >
                      <Activity size={16} color="#FFFFFF" />
                      <Text style={styles.workProgressButtonText}>
                        View Progress
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Create Tender Modal */}
      <Modal visible={showCreateTenderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Tender</Text>
              <TouchableOpacity onPress={() => setShowCreateTenderModal(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tender Title *</Text>
                <TextInput
                  style={styles.textInput}
                  value={tenderData.title}
                  onChangeText={(text) => setTenderData({...tenderData, title: text})}
                  placeholder="Enter tender title"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Category *</Text>
                <View style={styles.categoryContainer}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryOption,
                        tenderData.category === cat.id && styles.categoryOptionActive
                      ]}
                      onPress={() => setTenderData({...tenderData, category: cat.id})}
                    >
                      <Text style={[
                        styles.categoryOptionText,
                        tenderData.category === cat.id && styles.categoryOptionTextActive
                      ]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location *</Text>
                <TextInput
                  style={styles.textInput}
                  value={tenderData.location}
                  onChangeText={(text) => setTenderData({...tenderData, location: text})}
                  placeholder="Project location"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description *</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={tenderData.description}
                  onChangeText={(text) => setTenderData({...tenderData, description: text})}
                  placeholder="Detailed tender description"
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputGroupHalf}>
                  <Text style={styles.inputLabel}>Min Budget ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={tenderData.estimatedBudgetMin}
                    onChangeText={(text) => setTenderData({...tenderData, estimatedBudgetMin: text})}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.inputGroupHalf}>
                  <Text style={styles.inputLabel}>Max Budget ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={tenderData.estimatedBudgetMax}
                    onChangeText={(text) => setTenderData({...tenderData, estimatedBudgetMax: text})}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Deadline Date *</Text>
                <TextInput
                  style={styles.textInput}
                  value={tenderData.deadlineDate}
                  onChangeText={(text) => setTenderData({...tenderData, deadlineDate: text})}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Requirements</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={tenderData.requirements}
                  onChangeText={(text) => setTenderData({...tenderData, requirements: text})}
                  placeholder="List requirements (one per line)"
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowCreateTenderModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, creating && styles.modalSubmitButtonDisabled]}
                onPress={submitTender}
                disabled={creating}
              >
                <FileText size={16} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>
                  {creating ? 'Creating...' : 'Create Tender'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bids Modal */}
      <Modal visible={showBidsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tender Bids</Text>
              <TouchableOpacity onPress={() => setShowBidsModal(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {selectedTender && (
              <View style={styles.tenderInfo}>
                <Text style={styles.tenderInfoTitle}>{selectedTender.title}</Text>
                <Text style={styles.tenderInfoBudget}>
                  Budget: {formatCurrency(selectedTender.estimated_budget_min)} - {formatCurrency(selectedTender.estimated_budget_max)}
                </Text>
              </View>
            )}

            <ScrollView style={styles.bidsContainer}>
              {loadingBids ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading bids...</Text>
                </View>
              ) : tenderBids.length === 0 ? (
                <View style={styles.emptyState}>
                  <Users size={32} color="#9CA3AF" />
                  <Text style={styles.emptyText}>No bids received yet</Text>
                </View>
              ) : (
                <View style={styles.bidsList}>
                  {tenderBids.map((bid) => (
                    <View key={bid.id} style={styles.bidCard}>
                      {/* Bid Header */}
                      <View style={styles.bidHeader}>
                        <View style={styles.bidderInfo}>
                          <Text style={styles.bidderName}>
                            {bid.contractor?.full_name || 'Anonymous Contractor'}
                          </Text>
                          <Text style={styles.bidAmount}>{formatCurrency(bid.amount)}</Text>
                        </View>
                        <View style={[styles.bidStatusBadge, { backgroundColor: getStatusColor(bid.status) + '20' }]}>
                          <Text style={[styles.bidStatusText, { color: getStatusColor(bid.status) }]}>
                            {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                          </Text>
                        </View>
                      </View>

                      {/* Bid Details */}
                      <Text style={styles.bidDetails}>{bid.details}</Text>
                      
                      {bid.timeline && (
                        <View style={styles.bidMetaRow}>
                          <Text style={styles.bidMetaText}>Timeline: {bid.timeline}</Text>
                        </View>
                      )}

                      <View style={styles.bidMetaRow}>
                        <Text style={styles.bidMetaText}>Submitted: {formatDate(bid.submitted_at)}</Text>
                      </View>

                      {/* Bid Actions */}
                      {bid.status === 'submitted' && selectedTender.status === 'available' && (
                        <View style={styles.bidActions}>
                          <TouchableOpacity
                            style={[styles.bidActionButton, styles.acceptButton]}
                            onPress={() => handleAcceptBid(bid.id, selectedTender.id)}
                            disabled={processingBid}
                          >
                            <CheckCircle size={14} color="#FFFFFF" />
                            <Text style={styles.bidActionText}>Accept</Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity
                            style={[styles.bidActionButton, styles.rejectButton]}
                            onPress={() => handleRejectBid(bid.id)}
                            disabled={processingBid}
                          >
                            <X size={14} color="#FFFFFF" />
                            <Text style={styles.bidActionText}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {bid.status === 'accepted' && (
                        <View style={styles.acceptedInfo}>
                          <Award size={14} color="#10B981" />
                          <Text style={styles.acceptedText}>Bid Accepted</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Work Progress Modal */}
      <Modal visible={showWorkProgressModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Work Progress Review</Text>
              <TouchableOpacity onPress={() => setShowWorkProgressModal(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {selectedTender && (
              <View style={styles.tenderInfo}>
                <Text style={styles.tenderInfoTitle}>{selectedTender.title}</Text>
                <Text style={styles.tenderInfoContractor}>
                  Contractor: {selectedTender.awarded_contractor?.full_name}
                </Text>
              </View>
            )}

            <ScrollView style={styles.progressContainer}>
              {workProgressList.length === 0 ? (
                <View style={styles.emptyState}>
                  <Activity size={32} color="#9CA3AF" />
                  <Text style={styles.emptyText}>No work progress submitted yet</Text>
                </View>
              ) : (
                <View style={styles.progressList}>
                  {workProgressList.map((progress) => (
                    <View key={progress.id} style={styles.progressCard}>
                      {/* Progress Header */}
                      <View style={styles.progressHeader}>
                        <View style={styles.progressMeta}>
                          <Text style={styles.progressType}>
                            {progress.progress_type.charAt(0).toUpperCase() + progress.progress_type.slice(1)}
                          </Text>
                          <View style={[styles.progressStatusBadge, { backgroundColor: getStatusColor(progress.status) + '20' }]}>
                            <Text style={[styles.progressStatusText, { color: getStatusColor(progress.status) }]}>
                              {progress.status.charAt(0).toUpperCase() + progress.status.slice(1)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.progressDate}>{formatDate(progress.created_at)}</Text>
                      </View>

                      <Text style={styles.progressTitle}>{progress.title}</Text>
                      <Text style={styles.progressDescription}>{progress.description}</Text>

                      {progress.progress_percentage !== null && (
                        <View style={styles.progressBar}>
                          <Text style={styles.progressPercentage}>{progress.progress_percentage}% Complete</Text>
                          <View style={styles.progressBarContainer}>
                            <View 
                              style={[
                                styles.progressBarFill, 
                                { width: `${progress.progress_percentage}%` }
                              ]} 
                            />
                          </View>
                        </View>
                      )}

                      {/* Verification Section */}
                      {progress.progress_type === 'completion' && progress.status === 'submitted' && (
                        <View style={styles.verificationSection}>
                          <Text style={styles.verificationTitle}>Department Verification</Text>
                          <TextInput
                            style={styles.verificationInput}
                            placeholder="Add verification notes..."
                            value={verificationNotes}
                            onChangeText={setVerificationNotes}
                            multiline
                            numberOfLines={3}
                          />
                          <View style={styles.verificationActions}>
                            <TouchableOpacity
                              style={[styles.verificationButton, styles.rejectVerificationButton]}
                              onPress={() => handleVerifyWork(progress.id, false)}
                              disabled={verifying}
                            >
                              <X size={14} color="#FFFFFF" />
                              <Text style={styles.verificationButtonText}>Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.verificationButton, styles.approveVerificationButton]}
                              onPress={() => handleVerifyWork(progress.id, true)}
                              disabled={verifying}
                            >
                              <CheckCircle size={14} color="#FFFFFF" />
                              <Text style={styles.verificationButtonText}>
                                {verifying ? 'Verifying...' : 'Approve & Complete'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {/* Verification Status */}
                      {progress.verified_at && (
                        <View style={styles.verifiedInfo}>
                          <CheckCircle size={14} color="#10B981" />
                          <Text style={styles.verifiedText}>
                            Verified by {progress.verified_by_profile?.full_name} on {formatDate(progress.verified_at)}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  backButton: {
    width: 40,
    height: 40,
    backgroundColor: '#F0F9FF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    backgroundColor: '#F0F9FF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  filtersSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    marginBottom: 8,
  },
  filtersList: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 16,
    alignItems: 'center',
  },
  filterChipBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },
  tendersList: {
    flex: 1,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  createFirstTenderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  createFirstTenderText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  tendersContainer: {
    padding: 16,
    gap: 16,
  },
  tenderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tenderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  tenderMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tenderDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  tenderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  tenderDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  tenderDetails: {
    gap: 6,
    marginBottom: 12,
  },
  tenderDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tenderDetailText: {
    fontSize: 12,
    color: '#374151',
  },
  awardedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    marginBottom: 12,
  },
  awardedText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  tenderActions: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  viewBidsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E40AF',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  viewBidsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  workProgressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  workProgressButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalForm: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroupHalf: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryOptionActive: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  categoryOptionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  categoryOptionTextActive: {
    color: '#FFFFFF',
  },
  tenderInfo: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    marginHorizontal: 20,
    borderRadius: 12,
    marginBottom: 16,
  },
  tenderInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4,
  },
  tenderInfoBudget: {
    fontSize: 14,
    color: '#1E40AF',
  },
  tenderInfoContractor: {
    fontSize: 14,
    color: '#1E40AF',
  },
  bidsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  progressContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  bidsList: {
    gap: 12,
  },
  progressList: {
    gap: 16,
  },
  bidCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  progressCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bidderInfo: {
    flex: 1,
  },
  progressMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  bidderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  progressType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  bidAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  bidStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  progressStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bidStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  bidDetails: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  progressDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  bidMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  bidMetaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  progressBar: {
    marginBottom: 12,
  },
  progressPercentage: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  bidActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
  },
  bidActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  acceptButton: {
    backgroundColor: '#10B981',
  },
  rejectButton: {
    backgroundColor: '#EF4444',
  },
  bidActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  acceptedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    marginTop: 12,
  },
  acceptedText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  verificationSection: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  verificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  verificationInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    textAlignVertical: 'top',
    minHeight: 80,
    marginBottom: 12,
  },
  verificationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  verificationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  rejectVerificationButton: {
    backgroundColor: '#EF4444',
  },
  approveVerificationButton: {
    backgroundColor: '#10B981',
  },
  verificationButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  verifiedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    marginTop: 12,
  },
  verifiedText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1E40AF',
    gap: 6,
  },
  modalSubmitButtonDisabled: {
    opacity: 0.6,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});