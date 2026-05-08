import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  MessageSquare, 
  ThumbsUp, 
  ThumbsDown,
  Send,
  History,
  Filter,
  Search,
  Eye,
  Download,
  Clock,
  User,
  TrendingUp
} from 'lucide-react';

interface ReviewItem {
  id: string;
  documentId: string;
  documentName: string;
  detector: string;
  originalResult: {
    authenticity: 'authentic' | 'forged' | 'suspicious';
    confidence: number;
    details: any;
  };
  reviewerNotes: string;
  finalVerdict: 'authentic' | 'forged' | 'suspicious' | null;
  reviewerId: string;
  reviewerName: string;
  reviewedAt: string;
  status: 'pending' | 'reviewed' | 'disputed';
  feedback: ReviewFeedback[];
}

interface ReviewFeedback {
  id: string;
  reviewerId: string;
  reviewerName: string;
  comment: string;
  timestamp: string;
  helpful: boolean;
}

interface ReviewStats {
  totalReviews: number;
  pendingReviews: number;
  accuracy: number;
  averageReviewTime: number;
}

const ManualReview: React.FC = () => {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats>({
    totalReviews: 0,
    pendingReviews: 0,
    accuracy: 0,
    averageReviewTime: 0
  });
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'disputed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Mock data - replace with API calls
  useEffect(() => {
    const mockData: ReviewItem[] = [
      {
        id: 'review_001',
        documentId: 'doc_123',
        documentName: 'suspicious_document_1.jpg',
        detector: 'ELA',
        originalResult: {
          authenticity: 'forged',
          confidence: 0.85,
          details: { error_level_analysis: 'high_anomaly_detected' }
        },
        reviewerNotes: '',
        finalVerdict: null,
        reviewerId: '',
        reviewerName: '',
        reviewedAt: '',
        status: 'pending',
        feedback: []
      },
      {
        id: 'review_002',
        documentId: 'doc_124',
        documentName: 'authentic_document_1.png',
        detector: 'Metadata',
        originalResult: {
          authenticity: 'authentic',
          confidence: 0.92,
          details: { metadata_consistent: true }
        },
        reviewerNotes: 'Appears authentic after manual inspection',
        finalVerdict: 'authentic',
        reviewerId: 'user_001',
        reviewerName: 'John Doe',
        reviewedAt: '2024-01-15T10:30:00Z',
        status: 'reviewed',
        feedback: [
          {
            id: 'fb_001',
            reviewerId: 'user_002',
            reviewerName: 'Jane Smith',
            comment: 'Good catch on the metadata consistency',
            timestamp: '2024-01-15T11:00:00Z',
            helpful: true
          }
        ]
      }
    ];

    setReviewItems(mockData);
    setReviewStats({
      totalReviews: 25,
      pendingReviews: 8,
      accuracy: 94.2,
      averageReviewTime: 12.5
    });
    setIsLoading(false);
  }, []);

  const filteredItems = reviewItems.filter(item => {
    const matchesFilter = filter === 'all' || item.status === filter;
    const matchesSearch = item.documentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.detector.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleSubmitReview = (verdict: 'authentic' | 'forged' | 'suspicious') => {
    if (!selectedItem || !reviewNote.trim()) return;

    const updatedItem = {
      ...selectedItem,
      finalVerdict: verdict,
      reviewerNotes: reviewNote,
      reviewerId: 'current_user',
      reviewerName: 'Current User',
      reviewedAt: new Date().toISOString(),
      status: 'reviewed' as const
    };

    setReviewItems(prev => prev.map(item => 
      item.id === selectedItem.id ? updatedItem : item
    ));
    
    setSelectedItem(updatedItem);
    setReviewNote('');
  };

  const handleSubmitFeedback = () => {
    if (!selectedItem || !feedbackComment.trim()) return;

    const newFeedback: ReviewFeedback = {
      id: `fb_${Date.now()}`,
      reviewerId: 'current_user',
      reviewerName: 'Current User',
      comment: feedbackComment,
      timestamp: new Date().toISOString(),
      helpful: false
    };

    const updatedItem = {
      ...selectedItem,
      feedback: [...selectedItem.feedback, newFeedback]
    };

    setReviewItems(prev => prev.map(item => 
      item.id === selectedItem.id ? updatedItem : item
    ));
    
    setSelectedItem(updatedItem);
    setFeedbackComment('');
    setShowFeedbackForm(false);
  };

  const getAuthenticityColor = (authenticity: string) => {
    switch (authenticity) {
      case 'authentic': return 'text-green-600 bg-green-100';
      case 'forged': return 'text-red-600 bg-red-100';
      case 'suspicious': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-blue-600 bg-blue-100';
      case 'reviewed': return 'text-green-600 bg-green-100';
      case 'disputed': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Manual Review</h2>
          <p className="text-gray-600">Review and validate forensic analysis results</p>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-2xl font-bold text-blue-600">{reviewStats.totalReviews}</div>
            <div className="text-sm text-gray-600">Total Reviews</div>
          </div>
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-2xl font-bold text-orange-600">{reviewStats.pendingReviews}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-2xl font-bold text-green-600">{reviewStats.accuracy}%</div>
            <div className="text-sm text-gray-600">Accuracy</div>
          </div>
          <div className="bg-white p-3 rounded-lg border">
            <div className="text-2xl font-bold text-purple-600">{reviewStats.averageReviewTime}m</div>
            <div className="text-sm text-gray-600">Avg Time</div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg border ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg border ${filter === 'pending' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('reviewed')}
            className={`px-4 py-2 rounded-lg border ${filter === 'reviewed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Reviewed
          </button>
          <button
            onClick={() => setFilter('disputed')}
            className={`px-4 py-2 rounded-lg border ${filter === 'disputed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Disputed
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Review Items List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">Review Queue</h3>
              <p className="text-sm text-gray-600">{filteredItems.length} items</p>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                    selectedItem?.id === item.id ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 truncate">{item.documentName}</h4>
                      <p className="text-sm text-gray-600">{item.detector}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className={`px-2 py-1 text-xs rounded-full ${getAuthenticityColor(item.originalResult.authenticity)}`}>
                      {item.originalResult.authenticity} ({Math.round(item.originalResult.confidence * 100)}%)
                    </span>
                    <span className="text-xs text-gray-500">
                      {item.reviewedAt ? new Date(item.reviewedAt).toLocaleDateString() : 'Not reviewed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Review Details */}
        <div className="lg:col-span-2">
          {selectedItem ? (
            <div className="space-y-6">
              {/* Document Info */}
              <div className="bg-white rounded-lg border p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{selectedItem.documentName}</h3>
                    <p className="text-gray-600">Document ID: {selectedItem.documentId}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 text-sm rounded-full ${getStatusColor(selectedItem.status)}`}>
                      {selectedItem.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Detector</label>
                    <p className="text-gray-900">{selectedItem.detector}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Original Result</label>
                    <p className={`font-medium ${getAuthenticityColor(selectedItem.originalResult.authenticity)}`}>
                      {selectedItem.originalResult.authenticity} ({Math.round(selectedItem.originalResult.confidence * 100)}%)
                    </p>
                  </div>
                </div>

                {selectedItem.reviewerName && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Reviewer</label>
                      <p className="text-gray-900">{selectedItem.reviewerName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Reviewed At</label>
                      <p className="text-gray-900">{new Date(selectedItem.reviewedAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Review Form */}
              {selectedItem.status === 'pending' && (
                <div className="bg-white rounded-lg border p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Submit Review</h4>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Review Notes
                    </label>
                    <textarea
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Add your observations and reasoning..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSubmitReview('authentic')}
                      disabled={!reviewNote.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Authentic
                    </button>
                    <button
                      onClick={() => handleSubmitReview('forged')}
                      disabled={!reviewNote.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-4 w-4" />
                      Forged
                    </button>
                    <button
                      onClick={() => handleSubmitReview('suspicious')}
                      disabled={!reviewNote.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Suspicious
                    </button>
                  </div>
                </div>
              )}

              {/* Review Result */}
              {selectedItem.finalVerdict && (
                <div className="bg-white rounded-lg border p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="text-lg font-semibold text-gray-900">Review Result</h4>
                    <span className={`px-3 py-1 text-sm rounded-full font-medium ${getAuthenticityColor(selectedItem.finalVerdict)}`}>
                      {selectedItem.finalVerdict.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700">Reviewer Notes</label>
                    <p className="text-gray-900 mt-1">{selectedItem.reviewerNotes}</p>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4" />
                    <span>{selectedItem.reviewerName}</span>
                    <span>•</span>
                    <Clock className="h-4 w-4" />
                    <span>{new Date(selectedItem.reviewedAt).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Feedback Section */}
              <div className="bg-white rounded-lg border p-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-semibold text-gray-900">Feedback</h4>
                  <button
                    onClick={() => setShowFeedbackForm(!showFeedbackForm)}
                    className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Add Feedback
                  </button>
                </div>

                <AnimatePresence>
                  {showFeedbackForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 p-4 bg-gray-50 rounded-lg"
                    >
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Add your feedback..."
                      />
                      <div className="flex justify-end gap-2 mt-3">
                        <button
                          onClick={() => setShowFeedbackForm(false)}
                          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSubmitFeedback}
                          disabled={!feedbackComment.trim()}
                          className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Send className="h-3 w-3" />
                          Submit
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-4">
                  {selectedItem.feedback.map((feedback) => (
                    <div key={feedback.id} className="border-l-4 border-blue-200 pl-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{feedback.reviewerName}</span>
                          <span className="text-sm text-gray-500">
                            {new Date(feedback.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button className="p-1 text-gray-400 hover:text-green-600">
                            <ThumbsUp className="h-4 w-4" />
                          </button>
                          <button className="p-1 text-gray-400 hover:text-red-600">
                            <ThumbsDown className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-700">{feedback.comment}</p>
                    </div>
                  ))}
                  
                  {selectedItem.feedback.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No feedback yet. Be the first to add feedback!</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border p-12 text-center">
              <div className="text-gray-400 mb-4">
                <Eye className="h-12 w-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a review item</h3>
              <p className="text-gray-600">Choose a document from the queue to start reviewing</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualReview;