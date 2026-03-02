import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Avatar,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Alert,
  Badge,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import {
  Description,
  Analytics,
  CheckCircle,
  Warning,
  Error,
  Visibility,
  CloudUpload,
  Psychology,
  Delete,
  Search,
  Edit,
  Download,
  MoreVert,
  Schedule,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canUpload = ['instructor', 'manager'].includes(user?.role);

  // Stats
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Syllabi list
  const [syllabi, setSyllabi] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, syllabus: null });
  const [editDialog, setEditDialog] = useState({ open: false, syllabus: null });
  const [menuAnchor, setMenuAnchor] = useState({ element: null, syllabus: null });
  const [listError, setListError] = useState('');

  // Upload
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadResults, setUploadResults] = useState([]);
  const [uploadError, setUploadError] = useState('');

  const maxSize = 10 * 1024 * 1024;
  const acceptedFormats = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/msword': ['.doc'],
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const syllabiRequest = isAdmin
        ? api.get('/reports/recent-syllabi', { params: { limit: 100 } })
        : api.syllabus.getMySyllabi();

      const [statsResponse, syllabiResponse] = await Promise.all([
        api.get('/users/stats'),
        syllabiRequest,
      ]);

      setStats(statsResponse.data);
      const list = syllabiResponse.data.syllabi || [];
      setSyllabi(list);
      const pending = isAdmin
        ? 0
        : list.reduce(
            (acc, s) =>
              acc +
              (Array.isArray(s.recommendations)
                ? s.recommendations.filter((r) => r.status === 'pending').length
                : 0),
            0
          );
      setPendingTotal(pending);
    } catch (err) {
      setError('Error loading dashboard data');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const reloadSyllabi = useCallback(async () => {
    try {
      const syllabiRequest = isAdmin
        ? api.get('/reports/recent-syllabi', { params: { limit: 100 } })
        : api.syllabus.getMySyllabi();
      const response = await syllabiRequest;
      const list = response.data.syllabi || [];
      setSyllabi(list);
      const pending = isAdmin
        ? 0
        : list.reduce(
            (acc, s) =>
              acc +
              (Array.isArray(s.recommendations)
                ? s.recommendations.filter((r) => r.status === 'pending').length
                : 0),
            0
          );
      setPendingTotal(pending);
    } catch (err) {
      setListError('Failed to reload syllabi');
    }
  }, [isAdmin]);

  // Upload handlers
  const onDrop = (acceptedFiles, rejectedFiles) => {
    setUploadError('');
    if (rejectedFiles.length > 0) {
      const reasons = rejectedFiles.map((file) =>
        file.errors.map((err) => err.message).join(', ')
      );
      setUploadError(`Some files were rejected: ${reasons.join('; ')}`);
    }
    const newFiles = acceptedFiles.map((file) => ({
      file,
      id: Math.random().toString(36),
      courseName: '',
      courseCode: '',
      uploadStatus: 'pending',
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFormats,
    maxSize,
    multiple: true,
  });

  const removeFile = (fileId) => {
    setFiles(files.filter((f) => f.id !== fileId));
  };

  const updateFileMetadata = (fileId, field, value) => {
    setFiles(files.map((f) => (f.id === fileId ? { ...f, [field]: value } : f)));
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      setUploadError('Please select files to upload');
      return;
    }
    const invalidFiles = files.filter((f) => !f.courseName.trim());
    if (invalidFiles.length > 0) {
      setUploadError('Please enter a course name for all files');
      return;
    }

    setUploading(true);
    setUploadResults([]);

    for (const fileData of files) {
      try {
        setUploadProgress((prev) => ({ ...prev, [fileData.id]: 0 }));
        const formData = new FormData();
        formData.append('syllabus', fileData.file);
        formData.append('courseName', fileData.courseName);
        formData.append('courseCode', fileData.courseCode);

        const response = await api.syllabus.upload(formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress((prev) => ({ ...prev, [fileData.id]: percentCompleted }));
          },
        });

        setUploadResults((prev) => [
          ...prev,
          {
            ...fileData,
            success: true,
            syllabusId: response.data.syllabusId || response.data._id,
          },
        ]);
      } catch (err) {
        const errorMessage = err.response?.data?.message || err.message || 'Upload error';
        setUploadResults((prev) => [
          ...prev,
          { ...fileData, success: false, error: errorMessage },
        ]);
      }
    }

    setUploading(false);
    setFiles([]);
    reloadSyllabi();
  };

  const formatFileSize = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

  // Syllabi list handlers
  const handleDelete = async () => {
    try {
      await api.syllabus.deleteSyllabus(deleteDialog.syllabus._id);
      setSyllabi(syllabi.filter((s) => s._id !== deleteDialog.syllabus._id));
      setDeleteDialog({ open: false, syllabus: null });
    } catch (err) {
      setListError('Failed to delete syllabus');
    }
  };

  const handleEdit = async (formData) => {
    try {
      const response = await api.put(`/syllabus/${editDialog.syllabus._id}`, formData);
      setSyllabi(
        syllabi.map((s) =>
          s._id === editDialog.syllabus._id ? response.data.syllabus || response.data : s
        )
      );
      setEditDialog({ open: false, syllabus: null });
    } catch (err) {
      setListError('Failed to update syllabus');
    }
  };

  const handleDownload = async (syllabusId, filename) => {
    try {
      const response = await api.get(`/syllabus/${syllabusId}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setListError('Failed to download file');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'analyzed':
        return <CheckCircle color="success" />;
      case 'processing':
        return <Schedule color="warning" />;
      case 'error':
        return <Error color="error" />;
      default:
        return <Warning color="action" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'analyzed':
        return 'Analyzed';
      case 'processing':
        return 'Processing';
      case 'error':
        return 'Error';
      default:
        return 'Pending';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'analyzed':
        return 'success';
      case 'processing':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const filteredSyllabi = syllabi
    .filter((syllabus) => {
      const originalName =
        syllabus.originalName || syllabus.originalFile?.originalName || '';
      const courseName =
        syllabus.courseName || syllabus.course?.name || syllabus.title || '';
      const matchesSearch =
        originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        courseName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        !statusFilter || (syllabus.status && syllabus.status === statusFilter);
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (
            (a.originalName || a.originalFile?.originalName || '')
          ).localeCompare(b.originalName || b.originalFile?.originalName || '');
        case 'course':
          return (
            (a.courseName || a.course?.name || a.title || '')
          ).localeCompare(b.courseName || b.course?.name || b.title || '');
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading dashboard...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Page title header with white text on primary background */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'white',
          mx: -3,
          mt: -3,
          px: 3,
          pt: 3,
          pb: 2,
          mb: 3,
        }}
      >
        <Typography variant="h4" gutterBottom sx={{ color: 'white' }}>
          Hello, {user?.firstName}
        </Typography>
        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.85)' }}>
          Welcome to AI Syllabus Analyzer. Review your syllabi and get AI recommendations.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <Description />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.totalSyllabi || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Syllabi
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                  <CheckCircle />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.analyzedSyllabi || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Analyzed
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {!isAdmin && (
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                    <Analytics />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight="bold">
                      {pendingTotal}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Pending Recommendations
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Upload Section (instructors and managers only) */}
      {canUpload && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            Upload Syllabus
          </Typography>

          {uploadError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {uploadError}
            </Alert>
          )}

          {/* Upload results */}
          {uploadResults.length > 0 && (
            <Box sx={{ mb: 2 }}>
              {uploadResults.map((result) => (
                <Paper key={result.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    {result.success ? (
                      <CheckCircle color="success" />
                    ) : (
                      <Error color="error" />
                    )}
                    <Typography variant="subtitle2" sx={{ ml: 1 }}>
                      {result.file.name}
                    </Typography>
                  </Box>
                  {result.success ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label="Successfully Uploaded" color="success" size="small" />
                      <Button
                        size="small"
                        onClick={() => navigate(`/syllabi/${result.syllabusId}`)}
                      >
                        View Analysis
                      </Button>
                    </Box>
                  ) : (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {result.error}
                    </Alert>
                  )}
                </Paper>
              ))}
              <Button
                variant="text"
                size="small"
                onClick={() => setUploadResults([])}
                sx={{ mt: 1 }}
              >
                Clear results
              </Button>
            </Box>
          )}

          <Card>
            <CardContent sx={{ p: 3 }}>
              {/* Drop zone */}
              <Paper
                {...getRootProps()}
                sx={{
                  p: 4,
                  textAlign: 'center',
                  border: '2px dashed',
                  borderColor: isDragActive ? 'primary.main' : 'grey.300',
                  backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                <input {...getInputProps()} />
                <CloudUpload sx={{ fontSize: 56, color: 'primary.main', mb: 1 }} />
                <Typography variant="h6" gutterBottom>
                  {isDragActive
                    ? 'Drop files here...'
                    : 'Drag and drop files here or click to select'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Supported formats: PDF, DOC, DOCX (max 10MB)
                </Typography>
              </Paper>

              {/* File list with inline metadata */}
              {files.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    Selected Files ({files.length})
                  </Typography>
                  {files.map((fileData) => (
                    <Paper key={fileData.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Description color="primary" />
                        <Typography variant="body2" sx={{ ml: 1, flex: 1 }}>
                          {fileData.file.name}
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: 1 }}
                          >
                            ({formatFileSize(fileData.file.size)})
                          </Typography>
                        </Typography>
                        <IconButton size="small" onClick={() => removeFile(fileData.id)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Course Name *"
                            value={fileData.courseName}
                            onChange={(e) =>
                              updateFileMetadata(fileData.id, 'courseName', e.target.value)
                            }
                            placeholder="e.g., Microeconomics"
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Course Code"
                            value={fileData.courseCode}
                            onChange={(e) =>
                              updateFileMetadata(fileData.id, 'courseCode', e.target.value)
                            }
                            placeholder="e.g., ECON101"
                          />
                        </Grid>
                      </Grid>
                    </Paper>
                  ))}

                  <Box sx={{ textAlign: 'right', mt: 2 }}>
                    <Button
                      variant="contained"
                      size="large"
                      onClick={uploadFiles}
                      disabled={uploading}
                      startIcon={
                        uploading ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          <Psychology />
                        )
                      }
                    >
                      {uploading ? 'Uploading...' : 'Upload and Analyze'}
                    </Button>
                  </Box>

                  {uploading && (
                    <Box sx={{ mt: 2 }}>
                      {files.map(
                        (f) =>
                          uploadProgress[f.id] !== undefined && (
                            <Box key={f.id} sx={{ mb: 1 }}>
                              <Typography variant="caption">{f.file.name}</Typography>
                              <LinearProgress
                                variant="determinate"
                                value={uploadProgress[f.id]}
                                sx={{ mt: 0.5 }}
                              />
                            </Box>
                          )
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Syllabi List */}
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        {isAdmin ? 'All Syllabi' : 'My Syllabi'}
      </Typography>

      {listError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {listError}
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                placeholder="Search syllabi..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <Search sx={{ mr: 1, color: 'action.active' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="Status"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="processing">Processing</MenuItem>
                  <MenuItem value="analyzed">Analyzed</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Sort by</InputLabel>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  label="Sort by"
                >
                  <MenuItem value="createdAt">Creation date</MenuItem>
                  <MenuItem value="name">File name</MenuItem>
                  <MenuItem value="course">Course name</MenuItem>
                  <MenuItem value="status">Status</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Typography variant="body2" color="text.secondary">
                Found: {filteredSyllabi.length}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>File</TableCell>
              {isAdmin && <TableCell>Instructor</TableCell>}
              <TableCell>Course</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Recommendations</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredSyllabi.length > 0 ? (
              filteredSyllabi.map((syllabus) => (
                <TableRow key={syllabus._id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Avatar sx={{ bgcolor: 'primary.main', mr: 2, width: 32, height: 32 }}>
                        <Description fontSize="small" />
                      </Avatar>
                      <Typography variant="body2" fontWeight="600">
                        {syllabus.originalName ||
                          syllabus.originalFile?.originalName ||
                          syllabus.title ||
                          'Untitled'}
                      </Typography>
                    </Box>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {syllabus.instructor
                        ? `${syllabus.instructor.firstName || ''} ${syllabus.instructor.lastName || ''}`.trim()
                        : '—'}
                    </TableCell>
                  )}
                  <TableCell>
                    {syllabus.courseName ||
                      syllabus.course?.name ||
                      syllabus.title ||
                      'N/A'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getStatusIcon(syllabus.status)}
                      label={getStatusText(syllabus.status)}
                      color={getStatusColor(syllabus.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {Array.isArray(syllabus.recommendations) &&
                    syllabus.recommendations.length > 0 ? (
                      (() => {
                        const pending = syllabus.recommendations.filter(
                          (r) => r.status === 'pending'
                        ).length;
                        const total = syllabus.recommendations.length;
                        return pending > 0 ? (
                          <Chip
                            label={`Pending: ${pending}`}
                            color="warning"
                            size="small"
                          />
                        ) : (
                          <Chip
                            label={`Processed (${total})`}
                            color="success"
                            size="small"
                          />
                        );
                      })()
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(syllabus.createdAt).toLocaleDateString('en-US')}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Tooltip title="View analysis">
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/syllabi/${syllabus._id}`)}
                        >
                          {Array.isArray(syllabus.recommendations) ? (
                            (() => {
                              const pending = syllabus.recommendations.filter(
                                (r) => r.status === 'pending'
                              ).length;
                              return (
                                <Badge
                                  color="warning"
                                  badgeContent={pending}
                                  invisible={pending === 0}
                                  overlap="circular"
                                >
                                  <Visibility />
                                </Badge>
                              );
                            })()
                          ) : (
                            <Visibility />
                          )}
                        </IconButton>
                      </Tooltip>

                      {!isAdmin && (
                        <Tooltip title="More actions">
                          <IconButton
                            size="small"
                            onClick={(e) =>
                              setMenuAnchor({ element: e.currentTarget, syllabus })
                            }
                          >
                            <MoreVert />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6} align="center">
                  <Box sx={{ py: 4 }}>
                    <Description sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                      No syllabi found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {searchTerm || statusFilter
                        ? 'Try adjusting your search criteria'
                        : canUpload
                        ? 'Upload your first syllabus above to get started'
                        : 'No syllabi available for this account'}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor.element}
        open={Boolean(menuAnchor.element)}
        onClose={() => setMenuAnchor({ element: null, syllabus: null })}
      >
        <MenuItem
          onClick={() => {
            setEditDialog({ open: true, syllabus: menuAnchor.syllabus });
            setMenuAnchor({ element: null, syllabus: null });
          }}
        >
          <ListItemIcon>
            <Edit />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            const fileName =
              menuAnchor.syllabus.originalName ||
              menuAnchor.syllabus.originalFile?.originalName ||
              menuAnchor.syllabus.title ||
              'syllabus';
            handleDownload(menuAnchor.syllabus._id, fileName);
            setMenuAnchor({ element: null, syllabus: null });
          }}
        >
          <ListItemIcon>
            <Download />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            navigate(`/syllabi/${menuAnchor.syllabus._id}`);
            setMenuAnchor({ element: null, syllabus: null });
          }}
        >
          <ListItemIcon>
            <Analytics />
          </ListItemIcon>
          <ListItemText>Reports</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            setDeleteDialog({ open: true, syllabus: menuAnchor.syllabus });
            setMenuAnchor({ element: null, syllabus: null });
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <Delete color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, syllabus: null })}
      >
        <DialogTitle>Confirm deletion</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete syllabus "
            {deleteDialog.syllabus?.originalName}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, syllabus: null })}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <EditSyllabusDialog
        open={editDialog.open}
        syllabus={editDialog.syllabus}
        onClose={() => setEditDialog({ open: false, syllabus: null })}
        onSave={handleEdit}
      />
    </Box>
  );
};

const EditSyllabusDialog = ({ open, syllabus, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    courseName: '',
    courseCode: '',
    description: '',
  });

  useEffect(() => {
    if (syllabus) {
      setFormData({
        courseName: syllabus.courseName || '',
        courseCode: syllabus.courseCode || '',
        description: syllabus.description || '',
      });
    }
  }, [syllabus]);

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit syllabus</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Course name"
          value={formData.courseName}
          onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Course code"
          value={formData.courseCode}
          onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          margin="normal"
          multiline
          rows={3}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default Dashboard;
